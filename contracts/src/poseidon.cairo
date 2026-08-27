use core::poseidon::poseidon_hash_span;
use starknet::ContractAddress;

pub const REG_TAG: felt252 = 'HIMITSU_REG_TAG:V1';
pub const LEAF_TAG: felt252 = 'HIMITSU_LEAF_TAG:V1';

pub fn compute_commitment(secret: felt252) -> felt252 {
    poseidon_hash_span(array![REG_TAG, secret].span())
}

pub fn compute_leaf(commitment: felt252, token: ContractAddress, total: u128) -> felt252 {
    poseidon_hash_span(array![LEAF_TAG, commitment, token.into(), total.into()].span())
}

/// Sorted-pair Poseidon hash: the two children are ordered numerically before hashing so the
/// same pair always produces the same parent regardless of traversal order.
pub fn hash_pair(a: felt252, b: felt252) -> felt252 {
    let a_u256: u256 = a.into();
    let b_u256: u256 = b.into();
    let (lo, hi) = if a_u256 <= b_u256 {
        (a, b)
    } else {
        (b, a)
    };
    poseidon_hash_span(array![lo, hi].span())
}

/// Folds `leaf` up through a sorted-pair Poseidon merkle `proof` and checks the result matches
/// `root`.
pub fn verify_proof(leaf: felt252, proof: Span<felt252>, root: felt252) -> bool {
    let mut computed = leaf;
    let mut i: u32 = 0;
    let len = proof.len();
    while i < len {
        computed = hash_pair(computed, *proof.at(i));
        i += 1;
    }
    computed == root
}
