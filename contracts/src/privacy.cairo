use starknet::ContractAddress;

/// Local stand-in for `privacy::objects::OpenNoteDeposit`.
///
/// The real struct lives in the `starkware-libs/starknet-privacy` monorepo, which we do not
/// depend on directly (its dependency chain requires Cairo ^2.18.0; this workspace is pinned
/// to 2.17.0 per ARCHITECTURE.md). Serde on Starknet structs is purely positional, so this
/// definition is wire-compatible with the pool's real return type as long as field order and
/// types match exactly.
#[derive(Drop, Copy, Serde)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}
