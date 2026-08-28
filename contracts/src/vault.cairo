use starknet::ContractAddress;
use crate::privacy::OpenNoteDeposit;

#[derive(Drop, Serde, starknet::Store)]
pub struct Epoch {
    pub token: ContractAddress,
    pub root: felt252,
    pub total: u128,
    pub vest_start: u64,
    pub vest_duration: u64,
}

#[starknet::interface]
pub trait IHimitsuVault<TContractState> {
    /// Sponsor a token's reward budget. Funds sit as uncommitted `available` balance until the
    /// operator commits some of it to an epoch via `post_root`.
    fn fund(ref self: TContractState, token: ContractAddress, amount: u128);
    /// Register a reward commitment `poseidon(REG_TAG, secret)` from the depositing address.
    /// Deduped per (caller, commitment) so nobody can burn a victim's commitment by front-running.
    fn register(ref self: TContractState, commitment: felt252);
    /// Commit an epoch: reserves `total` of `token` out of `available` so the epoch is provably
    /// solvent on-chain. Write-once, operator-only.
    fn post_root(
        ref self: TContractState,
        epoch_id: u64,
        token: ContractAddress,
        root: felt252,
        total: u128,
        vest_start: u64,
        vest_duration: u64,
    );
    /// Claim an allocation, all-or-nothing, only after the epoch has fully vested. Called by the
    /// pool during a private transaction; credits the payout into an open note.
    fn privacy_invoke(
        ref self: TContractState,
        epoch_id: u64,
        secret: felt252,
        token: ContractAddress,
        total: u128,
        proof: Span<felt252>,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;
    // ── views ──
    fn get_available(self: @TContractState, token: ContractAddress) -> u128;
    fn get_pot_remaining(self: @TContractState, epoch_id: u64) -> u128;
    fn is_claimed(self: @TContractState, epoch_id: u64, leaf: felt252) -> bool;
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
        // Uncommitted, per-token sponsor funds not yet reserved to any epoch.
        available: Map<ContractAddress, u128>,
        // Remaining claimable budget for an epoch (== epoch.total minus everything claimed).
        pot_remaining: Map<u64, u128>,
        // Registration dedupe keyed by (caller, commitment) — griefing-proof.
        registered: Map<(ContractAddress, felt252), bool>,
        // Per-(epoch, leaf) nullifier: an allocation is claimable exactly once, regardless of who
        // learns the (public) secret. This is what closes the bearer-credential theft window.
        nullifiers: Map<(u64, felt252), bool>,
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
        #[key]
        pub token: ContractAddress,
        pub root: felt252,
        pub total: u128,
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
            assert(amount != 0, 'ZERO_AMOUNT');
            let funder = get_caller_address();
            let vault = get_contract_address();
            let erc20 = IERC20Dispatcher { contract_address: token };
            let ok = erc20.transfer_from(funder, vault, amount.into());
            assert(ok, 'TRANSFER_FROM_FAILED');
            self.available.write(token, self.available.read(token) + amount);
            self.emit(Funded { funder, token, amount });
        }

        fn register(ref self: ContractState, commitment: felt252) {
            let caller = get_caller_address();
            assert(!self.registered.read((caller, commitment)), 'ALREADY_REGISTERED');
            self.registered.write((caller, commitment), true);
            self.emit(Registered { caller, commitment });
        }

        fn post_root(
            ref self: ContractState,
            epoch_id: u64,
            token: ContractAddress,
            root: felt252,
            total: u128,
            vest_start: u64,
            vest_duration: u64,
        ) {
            assert(get_caller_address() == self.operator.read(), 'CALLER_NOT_OPERATOR');
            assert(root != 0, 'ZERO_ROOT');
            assert(vest_duration != 0, 'ZERO_VEST_DURATION');
            assert(self.epochs.read(epoch_id).root == 0, 'EPOCH_ALREADY_POSTED');

            // Solvency is enforced on-chain: an epoch can only reserve budget that was actually
            // funded. This makes over-allocation impossible rather than a matter of operator trust.
            let avail = self.available.read(token);
            assert(avail >= total, 'INSUFFICIENT_AVAILABLE');
            self.available.write(token, avail - total);
            self.pot_remaining.write(epoch_id, total);

            self.epochs.write(epoch_id, Epoch { token, root, total, vest_start, vest_duration });
            self.emit(RootPosted { epoch_id, token, root, total, vest_start, vest_duration });
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

            let epoch = self.epochs.read(epoch_id);
            assert(epoch.root != 0, 'EPOCH_NOT_POSTED');
            assert(epoch.token == token, 'WRONG_TOKEN');

            let commitment = compute_commitment(secret);
            let leaf = compute_leaf(commitment, token, total);
            assert(verify_proof(leaf, proof, epoch.root), 'BAD_PROOF');

            // Cliff, not linear: an allocation is claimable only once the epoch has FULLY vested,
            // and pays the whole `total` in a single shot. Combined with the nullifier below this
            // means a claim never leaves an unclaimed remainder — so revealing the (public) secret
            // in claim calldata cannot be used by a third party to sweep a leftover balance.
            let now = get_block_timestamp();
            assert(now >= epoch.vest_start + epoch.vest_duration, 'NOT_VESTED');

            assert(!self.nullifiers.read((epoch_id, leaf)), 'ALREADY_CLAIMED');
            self.nullifiers.write((epoch_id, leaf), true);

            // Debit the epoch's reserved budget. Guaranteed to succeed given post_root's solvency
            // check, but asserted defensively.
            let remaining = self.pot_remaining.read(epoch_id);
            assert(remaining >= total, 'INSUFFICIENT_POT');
            self.pot_remaining.write(epoch_id, remaining - total);

            let erc20 = IERC20Dispatcher { contract_address: token };
            let ok = erc20.approve(pool, total.into());
            assert(ok, 'APPROVE_FAILED');

            self.emit(Claimed { epoch_id, leaf, token, payout: total });

            array![OpenNoteDeposit { note_id, token, amount: total }].span()
        }

        fn get_available(self: @ContractState, token: ContractAddress) -> u128 {
            self.available.read(token)
        }

        fn get_pot_remaining(self: @ContractState, epoch_id: u64) -> u128 {
            self.pot_remaining.read(epoch_id)
        }

        fn is_claimed(self: @ContractState, epoch_id: u64, leaf: felt252) -> bool {
            self.nullifiers.read((epoch_id, leaf))
        }
    }
}
