use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockPool<TContractState> {
    fn deposit(ref self: TContractState, token: ContractAddress, amount: u128);
    fn claim_via(
        ref self: TContractState,
        vault: ContractAddress,
        epoch_id: u64,
        secret: felt252,
        token: ContractAddress,
        total: u128,
        proof: Array<felt252>,
        note_id: felt252,
    );
}

/// Devnet/test stand-in for the STRK20 pool, used only by scripts/rehearse-devnet.sh.
///
/// Two jobs, both about exercising the REAL integration surfaces unchanged:
/// - `deposit` emits a `Deposit` event wire-identical to the live pool's
///   (`keys=[sn_keccak("Deposit"), user, token]`, `data=[amount:u128]` — the layout
///   indexer/src/rpc.ts:decodeDeposit documents), so `make indexer-once` pointed at this
///   contract scans it with zero changes. Custody and the flat pool fee are out of scope:
///   the indexer reads only the event.
/// - `claim_via` calls the vault's `privacy_invoke` so its pool-as-caller assertion holds,
///   then consumes the vault's approval with `transfer_from` the way the live pool does
///   when crediting the open note. A rehearsal claim therefore proves funds actually move.
///
/// Never deploy this to mainnet.
#[starknet::contract]
pub mod MockPool {
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use crate::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use crate::vault::{IHimitsuVaultDispatcher, IHimitsuVaultDispatcherTrait};

    #[storage]
    struct Storage {}

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Deposit: Deposit,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Deposit {
        #[key]
        pub user: ContractAddress,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
    }

    #[abi(embed_v0)]
    impl MockPoolImpl of super::IMockPool<ContractState> {
        fn deposit(ref self: ContractState, token: ContractAddress, amount: u128) {
            self.emit(Deposit { user: get_caller_address(), token, amount });
        }

        fn claim_via(
            ref self: ContractState,
            vault: ContractAddress,
            epoch_id: u64,
            secret: felt252,
            token: ContractAddress,
            total: u128,
            proof: Array<felt252>,
            note_id: felt252,
        ) {
            let vault_d = IHimitsuVaultDispatcher { contract_address: vault };
            let notes = vault_d.privacy_invoke(epoch_id, secret, token, total, proof.span(), note_id);
            let note = *notes.at(0);
            let erc20 = IERC20Dispatcher { contract_address: note.token };
            let ok = erc20.transfer_from(vault, get_contract_address(), note.amount.into());
            assert(ok, 'PULL_FAILED');
        }
    }
}
