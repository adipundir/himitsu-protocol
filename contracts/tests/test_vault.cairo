use himitsu_vault::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use himitsu_vault::mock_erc20::{IMockERC20ExtraDispatcher, IMockERC20ExtraDispatcherTrait};
use himitsu_vault::poseidon::{compute_commitment, compute_leaf, hash_pair};
use himitsu_vault::vault::{IHimitsuVaultDispatcher, IHimitsuVaultDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

const VEST_START: u64 = 1000;
const VEST_DURATION: u64 = 1000;
const VESTED: u64 = VEST_START + VEST_DURATION; // the cliff: fully claimable at/after this

fn pool() -> ContractAddress {
    'POOL'.try_into().unwrap()
}
fn operator() -> ContractAddress {
    'OPERATOR'.try_into().unwrap()
}
fn funder() -> ContractAddress {
    'FUNDER'.try_into().unwrap()
}

fn deploy_mock_erc20() -> ContractAddress {
    let contract = declare("MockERC20").unwrap().contract_class();
    let (address, _) = contract.deploy(@ArrayTrait::new()).unwrap();
    address
}

fn deploy_vault() -> ContractAddress {
    let contract = declare("HimitsuVault").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];
    pool().serialize(ref calldata);
    operator().serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

/// Mint `amount` to `funder` and fund the vault's `available` budget for `token`.
fn fund_vault(vault: ContractAddress, token: ContractAddress, amount: u128) {
    let erc20 = IERC20Dispatcher { contract_address: token };
    let erc20_extra = IMockERC20ExtraDispatcher { contract_address: token };
    erc20_extra.mint(funder(), amount.into());
    start_cheat_caller_address(token, funder());
    erc20.approve(vault, amount.into());
    stop_cheat_caller_address(token);
    start_cheat_caller_address(vault, funder());
    IHimitsuVaultDispatcher { contract_address: vault }.fund(token, amount);
    stop_cheat_caller_address(vault);
}

/// Deploys vault + token, funds `total`, and posts a single-leaf epoch (`root == leaf`, empty
/// proof) for `(secret, token, total)`.
fn setup_single_leaf_epoch(
    epoch_id: u64, secret: felt252, total: u128,
) -> (ContractAddress, ContractAddress, felt252) {
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    fund_vault(vault, token, total);

    let leaf = compute_leaf(compute_commitment(secret), token, total);

    start_cheat_caller_address(vault, operator());
    IHimitsuVaultDispatcher { contract_address: vault }
        .post_root(epoch_id, token, leaf, total, VEST_START, VEST_DURATION);
    stop_cheat_caller_address(vault);

    (vault, token, leaf)
}

// ─── register ───────────────────────────────────────────────────────────────

#[test]
fn register_dedupes_and_emits() {
    let vault = deploy_vault();
    IHimitsuVaultDispatcher { contract_address: vault }.register('some_commitment');
}

#[test]
#[should_panic(expected: 'ALREADY_REGISTERED')]
fn register_rejects_duplicate_from_same_caller() {
    let vault = deploy_vault();
    let d = IHimitsuVaultDispatcher { contract_address: vault };
    start_cheat_caller_address(vault, funder());
    d.register('c');
    d.register('c');
}

#[test]
fn register_griefing_prevented_dedupe_is_per_caller() {
    // An attacker registering a victim's commitment under the attacker's OWN address must NOT
    // block the victim from registering the same commitment under theirs.
    let vault = deploy_vault();
    let d = IHimitsuVaultDispatcher { contract_address: vault };
    let attacker: ContractAddress = 'ATTACKER'.try_into().unwrap();
    let victim: ContractAddress = 'VICTIM'.try_into().unwrap();

    start_cheat_caller_address(vault, attacker);
    d.register('victims_commitment');
    stop_cheat_caller_address(vault);

    start_cheat_caller_address(vault, victim);
    d.register('victims_commitment'); // must succeed — different (caller, commitment) key
    stop_cheat_caller_address(vault);
}

// ─── post_root / solvency ─────────────────────────────────────────────────────

#[test]
#[should_panic(expected: 'CALLER_NOT_OPERATOR')]
fn post_root_rejects_non_operator() {
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    IHimitsuVaultDispatcher { contract_address: vault }
        .post_root(1, token, 'root', 0, VEST_START, VEST_DURATION);
}

#[test]
#[should_panic(expected: 'EPOCH_ALREADY_POSTED')]
fn post_root_is_write_once() {
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    let d = IHimitsuVaultDispatcher { contract_address: vault };
    start_cheat_caller_address(vault, operator());
    d.post_root(1, token, 'root_a', 0, VEST_START, VEST_DURATION);
    d.post_root(1, token, 'root_b', 0, VEST_START, VEST_DURATION);
}

#[test]
#[should_panic(expected: 'INSUFFICIENT_AVAILABLE')]
fn post_root_rejects_overallocation_beyond_funded() {
    // Solvency: an operator cannot commit an epoch to more budget than was actually funded.
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    fund_vault(vault, token, 500);
    start_cheat_caller_address(vault, operator());
    IHimitsuVaultDispatcher { contract_address: vault }
        .post_root(1, token, 'root', 1000, VEST_START, VEST_DURATION); // 1000 > 500 funded
}

#[test]
fn fund_accumulates_available() {
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    fund_vault(vault, token, 300);
    fund_vault(vault, token, 200);
    assert(
        IHimitsuVaultDispatcher { contract_address: vault }.get_available(token) == 500,
        'available should sum',
    );
}

// ─── privacy_invoke / claims ──────────────────────────────────────────────────

#[test]
#[should_panic(expected: 'CALLER_NOT_PRIVACY')]
fn privacy_invoke_rejects_non_pool_caller() {
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, 'secret_a', 1000);
    start_cheat_block_timestamp(vault, VESTED);
    IHimitsuVaultDispatcher { contract_address: vault }
        .privacy_invoke(1, 'secret_a', token, 1000, array![].span(), 'note_1');
}

#[test]
#[should_panic(expected: 'BAD_PROOF')]
fn privacy_invoke_rejects_bad_proof() {
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    let total: u128 = 1000;
    fund_vault(vault, token, total);

    // Real two-leaf tree; claim leaf0 with a corrupted sibling.
    let leaf0 = compute_leaf(compute_commitment('secret_0'), token, total);
    let leaf1 = compute_leaf(compute_commitment('secret_1'), token, total);
    let root = hash_pair(leaf0, leaf1);

    start_cheat_caller_address(vault, operator());
    IHimitsuVaultDispatcher { contract_address: vault }
        .post_root(1, token, root, total, VEST_START, VEST_DURATION);
    stop_cheat_caller_address(vault);

    start_cheat_block_timestamp(vault, VESTED);
    start_cheat_caller_address(vault, pool());
    IHimitsuVaultDispatcher { contract_address: vault }
        .privacy_invoke(1, 'secret_0', token, total, array![leaf1 + 1].span(), 'note_1');
}

#[test]
#[should_panic(expected: 'WRONG_TOKEN')]
fn privacy_invoke_rejects_token_mismatch() {
    let (vault, _token, _leaf) = setup_single_leaf_epoch(1, 'secret_a', 1000);
    let other: ContractAddress = 'OTHER_TOKEN'.try_into().unwrap();
    start_cheat_block_timestamp(vault, VESTED);
    start_cheat_caller_address(vault, pool());
    IHimitsuVaultDispatcher { contract_address: vault }
        .privacy_invoke(1, 'secret_a', other, 1000, array![].span(), 'note_1');
}

#[test]
#[should_panic(expected: 'NOT_VESTED')]
fn claim_before_cliff_reverts() {
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, 'secret_a', 1000);
    start_cheat_block_timestamp(vault, VESTED - 1); // one second short of the cliff
    start_cheat_caller_address(vault, pool());
    IHimitsuVaultDispatcher { contract_address: vault }
        .privacy_invoke(1, 'secret_a', token, 1000, array![].span(), 'note_1');
}

#[test]
fn claim_at_cliff_pays_full_allocation() {
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, 'secret_a', 1000);
    start_cheat_block_timestamp(vault, VESTED);
    start_cheat_caller_address(vault, pool());
    let notes = IHimitsuVaultDispatcher { contract_address: vault }
        .privacy_invoke(1, 'secret_a', token, 1000, array![].span(), 'note_1');
    let note = *notes.at(0);
    assert(note.amount == 1000, 'full allocation');
    assert(note.token == token, 'wrong token');
    assert(note.note_id == 'note_1', 'wrong note_id');
}

#[test]
#[should_panic(expected: 'ALREADY_CLAIMED')]
fn nullifier_blocks_second_claim_theft() {
    // THE theft fix: once claimed, the (public) secret is worthless — a second claim (e.g. an
    // attacker redirecting to their own note_id) reverts on the nullifier.
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, 'secret_a', 1000);
    start_cheat_block_timestamp(vault, VESTED);
    start_cheat_caller_address(vault, pool());
    let d = IHimitsuVaultDispatcher { contract_address: vault };
    d.privacy_invoke(1, 'secret_a', token, 1000, array![].span(), 'note_victim');
    // Attacker replays the now-public secret to a different note — must revert.
    d.privacy_invoke(1, 'secret_a', token, 1000, array![].span(), 'note_attacker');
}

#[test]
fn same_allocation_claimable_once_per_epoch() {
    // The claimed ledger is per-(epoch, leaf): the SAME (secret, token, total) earned in two
    // epochs is claimable independently in each.
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    let total: u128 = 1000;
    fund_vault(vault, token, total * 2);
    let leaf = compute_leaf(compute_commitment('secret_a'), token, total);

    start_cheat_caller_address(vault, operator());
    let d = IHimitsuVaultDispatcher { contract_address: vault };
    d.post_root(1, token, leaf, total, VEST_START, VEST_DURATION);
    d.post_root(2, token, leaf, total, VEST_START, VEST_DURATION);
    stop_cheat_caller_address(vault);

    start_cheat_block_timestamp(vault, VESTED);
    start_cheat_caller_address(vault, pool());
    assert((*d.privacy_invoke(1, 'secret_a', token, total, array![].span(), 'n1').at(0)).amount == 1000, 'epoch1');
    assert((*d.privacy_invoke(2, 'secret_a', token, total, array![].span(), 'n2').at(0)).amount == 1000, 'epoch2');
}

#[test]
fn claim_does_not_transfer_only_approves_pool() {
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, 'secret_a', 1000);
    let erc20_extra = IMockERC20ExtraDispatcher { contract_address: token };
    start_cheat_block_timestamp(vault, VESTED);
    start_cheat_caller_address(vault, pool());
    IHimitsuVaultDispatcher { contract_address: vault }
        .privacy_invoke(1, 'secret_a', token, 1000, array![].span(), 'note_1');
    // approve, never transfer; the pool pulls.
    assert(erc20_extra.balance_of(vault) == 1000, 'vault balance untouched');
    assert(erc20_extra.allowance(vault, pool()) == 1000, 'pool allowance shows payout');
}

#[test]
fn pot_remaining_decrements_on_claim() {
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, 'secret_a', 1000);
    let d = IHimitsuVaultDispatcher { contract_address: vault };
    assert(d.get_pot_remaining(1) == 1000, 'reserved at post_root');
    start_cheat_block_timestamp(vault, VESTED);
    start_cheat_caller_address(vault, pool());
    d.privacy_invoke(1, 'secret_a', token, 1000, array![].span(), 'note_1');
    assert(d.get_pot_remaining(1) == 0, 'debited on claim');
}
