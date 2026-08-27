use starknet::ContractAddress;

/// Test-only extras (mint + read helpers) so snforge tests can set up balances/allowances and
/// assert on them without a full ERC20 dependency.
#[starknet::interface]
pub trait IMockERC20Extra<TContractState> {
    fn mint(ref self: TContractState, to: ContractAddress, amount: u256);
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn allowance(self: @TContractState, owner: ContractAddress, spender: ContractAddress) -> u256;
}

/// Test-only ERC20 mock (mint + standard transfer_from/approve/balance_of/allowance). Lives in
/// src/, not tests/, purely so `declare("MockERC20")` can find it as a normal build artifact
/// without extra Scarb.toml `build-external-contracts` wiring. Never deployed for real — the
/// real HimitsuVault talks to real, already-deployed tokens via src/erc20.cairo's IERC20.
#[starknet::contract]
pub mod MockERC20 {
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use crate::erc20::IERC20;
    use super::IMockERC20Extra;

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[abi(embed_v0)]
    impl ERC20Impl of IERC20<ContractState> {
        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let caller = get_caller_address();
            let allowance = self.allowances.read((sender, caller));
            assert(allowance >= amount, 'INSUFFICIENT_ALLOWANCE');
            self.allowances.write((sender, caller), allowance - amount);

            let sender_balance = self.balances.read(sender);
            assert(sender_balance >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.write(sender, sender_balance - amount);
            self.balances.write(recipient, self.balances.read(recipient) + amount);
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.write((get_caller_address(), spender), amount);
            true
        }
    }

    #[abi(embed_v0)]
    impl MockERC20ExtraImpl of IMockERC20Extra<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            self.balances.write(to, self.balances.read(to) + amount);
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.read((owner, spender))
        }
    }
}
