use starknet::ContractAddress;

/// Local stand-in for `privacy::objects::OpenNoteDeposit`.
///
/// The real struct lives in the `starkware-libs/starknet-privacy` monorepo, which we do not
/// depend on directly (its dependency chain pins an older Cairo; this package tracks current
/// scarb instead — see contracts/Scarb.toml). Serde on Starknet structs is purely positional,
/// so this definition is wire-compatible with the pool's real return type as long as field
/// order and types match exactly.
#[derive(Drop, Copy, Serde)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}
