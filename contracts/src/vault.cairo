use starknet::ContractAddress;
use crate::privacy::OpenNoteDeposit;

#[derive(Drop, Serde, starknet::Store)]
pub struct Epoch {
    pub root: felt252,
    pub vest_start: u64,
    pub vest_duration: u64,
}

#[starknet::interface]
pub trait IHimitsuVault<TContractState> {
    fn fund(ref self: TContractState, token: ContractAddress, amount: u128);
    fn register(ref self: TContractState, commitment: felt252);
    fn post_root(
        ref self: TContractState, epoch_id: u64, root: felt252, vest_start: u64, vest_duration: u64,
    );
    fn privacy_invoke(
        ref self: TContractState,
        epoch_id: u64,
        secret: felt252,
        token: ContractAddress,
        total: u128,
        proof: Span<felt252>,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;
}

/// Stateful anonymizer, escrow pattern: `pool` is pinned at construction and asserted as caller
/// on every claim. See ARCHITECTURE.md's "HimitsuVault contract" section for the full spec this
/// implements.
#[starknet::contract]
pub mod HimitsuVault {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use crate::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use crate::poseidon::{compute_commitment, compute_leaf, verify_proof};
    use crate::privacy::OpenNoteDeposit;
    use super::{Epoch, IHimitsuVault};

    #[storage]
    struct Storage {
        pool: ContractAddress,
        operator: ContractAddress,
        epochs: Map<u64, Epoch>,
        registered: Map<felt252, bool>,
        claimed: Map<felt252, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Funded: Funded,
        Registered: Registered,
        RootPosted: RootPosted,
        Claimed: Claimed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Funded {
        pub funder: ContractAddress,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Registered {
        #[key]
        pub caller: ContractAddress,
        #[key]
        pub commitment: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RootPosted {
        #[key]
        pub epoch_id: u64,
        pub root: felt252,
        pub vest_start: u64,
        pub vest_duration: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Claimed {
        #[key]
        pub epoch_id: u64,
        #[key]
        pub leaf: felt252,
        pub token: ContractAddress,
        pub payout: u128,
    }

    #[constructor]
    fn constructor(ref self: ContractState, pool: ContractAddress, operator: ContractAddress) {
        self.pool.write(pool);
        self.operator.write(operator);
    }

    #[abi(embed_v0)]
    impl HimitsuVaultImpl of IHimitsuVault<ContractState> {
        fn fund(ref self: ContractState, token: ContractAddress, amount: u128) {
            let funder = get_caller_address();
            let vault = get_contract_address();
            let erc20 = IERC20Dispatcher { contract_address: token };
            let ok = erc20.transfer_from(funder, vault, amount.into());
            assert(ok, 'TRANSFER_FROM_FAILED');
            self.emit(Funded { funder, token, amount });
        }

        fn register(ref self: ContractState, commitment: felt252) {
            assert(!self.registered.read(commitment), 'ALREADY_REGISTERED');
            self.registered.write(commitment, true);
            self.emit(Registered { caller: get_caller_address(), commitment });
        }

        fn post_root(
            ref self: ContractState,
            epoch_id: u64,
            root: felt252,
            vest_start: u64,
            vest_duration: u64,
        ) {
            assert(get_caller_address() == self.operator.read(), 'CALLER_NOT_OPERATOR');
            assert(root != 0, 'ZERO_ROOT');
            assert(vest_duration != 0, 'ZERO_VEST_DURATION');
            assert(self.epochs.read(epoch_id).root == 0, 'EPOCH_ALREADY_POSTED');

            self.epochs.write(epoch_id, Epoch { root, vest_start, vest_duration });
            self.emit(RootPosted { epoch_id, root, vest_start, vest_duration });
        }

        fn privacy_invoke(
            ref self: ContractState,
            epoch_id: u64,
            secret: felt252,
            token: ContractAddress,
            total: u128,
            proof: Span<felt252>,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let pool = self.pool.read();
            assert(get_caller_address() == pool, 'CALLER_NOT_PRIVACY');

            let commitment = compute_commitment(secret);
            let leaf = compute_leaf(commitment, token, total);

            let epoch = self.epochs.read(epoch_id);
            assert(epoch.root != 0, 'EPOCH_NOT_POSTED');
            assert(verify_proof(leaf, proof, epoch.root), 'BAD_PROOF');

            let now = get_block_timestamp();
            let elapsed = if now > epoch.vest_start {
                now - epoch.vest_start
            } else {
                0
            };
            let capped_elapsed = if elapsed > epoch.vest_duration {
                epoch.vest_duration
            } else {
                elapsed
            };

            // u256 intermediate: total (u128) * capped_elapsed (u64) cannot overflow u256, and
            // vested <= total by construction, so the final try_into back to u128 is safe.
            let total_u256: u256 = total.into();
            let elapsed_u256: u256 = capped_elapsed.into();
            let duration_u256: u256 = epoch.vest_duration.into();
            let vested_u256: u256 = total_u256 * elapsed_u256 / duration_u256;
            let vested: u128 = vested_u256.try_into().unwrap();

            let already_claimed = self.claimed.read(leaf);
            assert(vested > already_claimed, 'NOTHING_VESTED');
            let payout = vested - already_claimed;
            self.claimed.write(leaf, already_claimed + payout);

            let erc20 = IERC20Dispatcher { contract_address: token };
            let ok = erc20.approve(pool, payout.into());
            assert(ok, 'APPROVE_FAILED');

            self.emit(Claimed { epoch_id, leaf, token, payout });

            array![OpenNoteDeposit { note_id, token, amount: payout }].span()
        }
    }
}
