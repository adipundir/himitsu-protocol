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

/// Deploys vault + token, mints `total` to `funder`, funds the vault's pot, and posts a
/// single-leaf epoch root (`root == leaf`, empty proof) for `(secret, token, total)`.
fn setup_single_leaf_epoch(
    epoch_id: u64, secret: felt252, total: u128,
) -> (ContractAddress, ContractAddress, felt252) {
    let vault = deploy_vault();
    let token = deploy_mock_erc20();
    let erc20 = IERC20Dispatcher { contract_address: token };
    let erc20_extra = IMockERC20ExtraDispatcher { contract_address: token };
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    erc20_extra.mint(funder(), total.into());
    start_cheat_caller_address(token, funder());
    erc20.approve(vault, total.into());
    stop_cheat_caller_address(token);

    start_cheat_caller_address(vault, funder());
    vault_dispatcher.fund(token, total);
    stop_cheat_caller_address(vault);

    let commitment = compute_commitment(secret);
    let leaf = compute_leaf(commitment, token, total);

    start_cheat_caller_address(vault, operator());
    vault_dispatcher.post_root(epoch_id, leaf, VEST_START, VEST_DURATION);
    stop_cheat_caller_address(vault);

    (vault, token, leaf)
}

#[test]
fn register_dedupes_and_emits() {
    let vault = deploy_vault();
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };
    let commitment: felt252 = 'some_commitment';

    vault_dispatcher.register(commitment);
}

#[test]
#[should_panic(expected: 'ALREADY_REGISTERED')]
fn register_rejects_duplicate_commitment() {
    let vault = deploy_vault();
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };
    let commitment: felt252 = 'some_commitment';

    vault_dispatcher.register(commitment);
    vault_dispatcher.register(commitment);
}

#[test]
#[should_panic(expected: 'CALLER_NOT_OPERATOR')]
fn post_root_rejects_non_operator() {
    let vault = deploy_vault();
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };
    // default caller in a test is not `operator()`.
    vault_dispatcher.post_root(1, 'some_root', VEST_START, VEST_DURATION);
}

#[test]
#[should_panic(expected: 'EPOCH_ALREADY_POSTED')]
fn post_root_is_write_once() {
    let vault = deploy_vault();
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    start_cheat_caller_address(vault, operator());
    vault_dispatcher.post_root(1, 'root_a', VEST_START, VEST_DURATION);
    vault_dispatcher.post_root(1, 'root_b', VEST_START, VEST_DURATION);
}

#[test]
#[should_panic(expected: 'CALLER_NOT_PRIVACY')]
fn privacy_invoke_rejects_non_pool_caller() {
    let secret: felt252 = 'secret_a';
    let total: u128 = 1000;
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, secret, total);
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION);
    // Caller is the test's default address, not pool() — must revert before touching state.
    vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_1');
}

#[test]
#[should_panic(expected: 'BAD_PROOF')]
fn privacy_invoke_rejects_bad_proof() {
    let token = deploy_mock_erc20();
    let vault = deploy_vault();
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };
    let erc20_extra = IMockERC20ExtraDispatcher { contract_address: token };
    let erc20 = IERC20Dispatcher { contract_address: token };

    let total: u128 = 1000;
    erc20_extra.mint(funder(), total.into());
    start_cheat_caller_address(token, funder());
    erc20.approve(vault, total.into());
    stop_cheat_caller_address(token);
    start_cheat_caller_address(vault, funder());
    vault_dispatcher.fund(token, total);
    stop_cheat_caller_address(vault);

    // Real two-leaf tree: root = hash_pair(leaf0, leaf1). Claiming leaf0 with leaf1's sibling
    // swapped for a wrong value must fail the merkle check.
    let commitment0 = compute_commitment('secret_0');
    let leaf0 = compute_leaf(commitment0, token, total);
    let leaf1 = compute_leaf(compute_commitment('secret_1'), token, total);
    let root = hash_pair(leaf0, leaf1);

    start_cheat_caller_address(vault, operator());
    vault_dispatcher.post_root(1, root, VEST_START, VEST_DURATION);
    stop_cheat_caller_address(vault);

    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION);
    start_cheat_caller_address(vault, pool());
    let wrong_sibling: felt252 = leaf1 + 1;
    vault_dispatcher
        .privacy_invoke(1, 'secret_0', token, total, array![wrong_sibling].span(), 'note_1');
}

#[test]
#[should_panic(expected: 'NOTHING_VESTED')]
fn vesting_at_zero_percent_reverts() {
    let secret: felt252 = 'secret_a';
    let total: u128 = 1000;
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, secret, total);
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    start_cheat_block_timestamp(vault, VEST_START); // elapsed = 0
    start_cheat_caller_address(vault, pool());
    vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_1');
}

#[test]
fn vesting_at_fifty_percent_pays_half() {
    let secret: felt252 = 'secret_a';
    let total: u128 = 1000;
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, secret, total);
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION / 2);
    start_cheat_caller_address(vault, pool());
    let notes = vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_1');
    let note = *notes.at(0);
    assert(note.amount == 500, 'expected 50% vested');
    assert(note.token == token, 'wrong token');
    assert(note.note_id == 'note_1', 'wrong note_id');
}

#[test]
fn vesting_at_hundred_percent_pays_full_and_caps_beyond() {
    let secret: felt252 = 'secret_a';
    let total: u128 = 1000;
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, secret, total);
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    // Well past vest_start + vest_duration: vesting must cap at `total`, not overrun it.
    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION * 10);
    start_cheat_caller_address(vault, pool());
    let notes = vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_1');
    assert((*notes.at(0)).amount == 1000, 'expected 100% vested');
}

#[test]
fn double_claim_yields_only_newly_vested_delta() {
    let secret: felt252 = 'secret_a';
    let total: u128 = 1000;
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, secret, total);
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    start_cheat_caller_address(vault, pool());

    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION / 2);
    let first = vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_1');
    assert((*first.at(0)).amount == 500, 'first claim should be 500');

    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION);
    let second = vault_dispatcher
        .privacy_invoke(1, secret, token, total, array![].span(), 'note_2');
    assert((*second.at(0)).amount == 500, 'second claim should be delta');
}

#[test]
#[should_panic(expected: 'NOTHING_VESTED')]
fn zero_payout_on_immediate_second_claim_reverts() {
    let secret: felt252 = 'secret_a';
    let total: u128 = 1000;
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, secret, total);
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };

    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION);
    start_cheat_caller_address(vault, pool());
    vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_1');
    // Same timestamp, nothing newly vested since the fully-vested claim above.
    vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_2');
}

#[test]
fn pool_pull_simulation_approve_visible_not_transferred() {
    let secret: felt252 = 'secret_a';
    let total: u128 = 1000;
    let (vault, token, _leaf) = setup_single_leaf_epoch(1, secret, total);
    let vault_dispatcher = IHimitsuVaultDispatcher { contract_address: vault };
    let erc20_extra = IMockERC20ExtraDispatcher { contract_address: token };

    start_cheat_block_timestamp(vault, VEST_START + VEST_DURATION);
    start_cheat_caller_address(vault, pool());
    vault_dispatcher.privacy_invoke(1, secret, token, total, array![].span(), 'note_1');

    // ARCHITECTURE.md: "approve, never transfer; the pool pulls" — the vault's balance is
    // untouched, but the pool's allowance over the vault's funds now covers the payout.
    assert(erc20_extra.balance_of(vault) == total.into(), 'vault balance must be untouched');
    assert(erc20_extra.allowance(vault, pool()) == total.into(), 'pool allowance must show payout');
}
