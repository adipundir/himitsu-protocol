use starknet::ContractAddress;

/// Minimal ERC20 surface HimitsuVault needs against real, already-deployed tokens (STRK, etc.).
/// Standard SNIP-2 signatures — not a guess, this is the stable convention every Starknet ERC20
/// (including OpenZeppelin's) implements.
#[starknet::interface]
pub trait IERC20<TContractState> {
    fn transfer_from(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
}
