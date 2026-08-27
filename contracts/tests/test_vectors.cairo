use starknet::ContractAddress;
use himitsu_vault::poseidon::{REG_TAG, LEAF_TAG, compute_commitment, compute_leaf, hash_pair};

/// Exports Cairo-computed Poseidon vectors (commitments, leaves, 4-leaf merkle root) as
/// `VECTOR key value` lines on stdout. `scripts/export_vectors.py` captures this test's output
/// and writes `epochs/vectors.json`, which indexer/ parity-checks its own Poseidon
/// implementation against (Phase 2's hard gate). Nothing here is deployed or on-chain — it only
/// pins down the exact hash preimages so the TS side can prove it reproduces the same math.
#[test]
fn export_parity_vectors() {
    let token_felt: felt252 = 0x1234567890abcdef;
    let token: ContractAddress = token_felt.try_into().unwrap();

    let secrets: [felt252; 4] = [
        'himitsu_vec_secret_0', 'himitsu_vec_secret_1', 'himitsu_vec_secret_2',
        'himitsu_vec_secret_3',
    ];
    let totals: [u128; 4] = [100, 200, 300, 400];

    let [secret_0, secret_1, secret_2, secret_3] = secrets;
    let [total_0, total_1, total_2, total_3] = totals;

    let commitment_0 = compute_commitment(secret_0);
    let commitment_1 = compute_commitment(secret_1);
    let commitment_2 = compute_commitment(secret_2);
    let commitment_3 = compute_commitment(secret_3);

    let leaf_0 = compute_leaf(commitment_0, token, total_0);
    let leaf_1 = compute_leaf(commitment_1, token, total_1);
    let leaf_2 = compute_leaf(commitment_2, token, total_2);
    let leaf_3 = compute_leaf(commitment_3, token, total_3);

    let node_0 = hash_pair(leaf_0, leaf_1);
    let node_1 = hash_pair(leaf_2, leaf_3);
    let root = hash_pair(node_0, node_1);

    println!("VECTOR reg_tag {}", REG_TAG);
    println!("VECTOR leaf_tag {}", LEAF_TAG);
    println!("VECTOR token {}", token_felt);

    println!("VECTOR secret_0 {}", secret_0);
    println!("VECTOR total_0 {}", total_0);
    println!("VECTOR commitment_0 {}", commitment_0);
    println!("VECTOR leaf_0 {}", leaf_0);

    println!("VECTOR secret_1 {}", secret_1);
    println!("VECTOR total_1 {}", total_1);
    println!("VECTOR commitment_1 {}", commitment_1);
    println!("VECTOR leaf_1 {}", leaf_1);

    println!("VECTOR secret_2 {}", secret_2);
    println!("VECTOR total_2 {}", total_2);
    println!("VECTOR commitment_2 {}", commitment_2);
    println!("VECTOR leaf_2 {}", leaf_2);

    println!("VECTOR secret_3 {}", secret_3);
    println!("VECTOR total_3 {}", total_3);
    println!("VECTOR commitment_3 {}", commitment_3);
    println!("VECTOR leaf_3 {}", leaf_3);

    println!("VECTOR root {}", root);

    // Sanity: verify_proof must accept the root it just built (guards the export itself, not
    // just production code).
    let proof_for_leaf_0: Array<felt252> = array![leaf_1, node_1];
    assert(
        himitsu_vault::poseidon::verify_proof(leaf_0, proof_for_leaf_0.span(), root),
        'bad proof for leaf_0',
    );
}
