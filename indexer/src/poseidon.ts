import { poseidonHashMany } from "@scure/starknet";

/**
 * Mirrors contracts/src/poseidon.cairo exactly. `poseidonHashMany` (sponge, append-1 +
 * zero-pad-to-rate) is `@scure/starknet`'s equivalent of Cairo's
 * `core::poseidon::poseidon_hash_span` — NOT the same as the library's 2-arg `poseidonHash`,
 * which uses different, non-span padding. Every hash here must go through `poseidonHashMany`
 * or the two sides silently diverge.
 */

export const REG_TAG = BigInt("0x" + Buffer.from("HIMITSU_REG_TAG:V1").toString("hex"));
export const LEAF_TAG = BigInt("0x" + Buffer.from("HIMITSU_LEAF_TAG:V1").toString("hex"));

export function computeCommitment(secret: bigint): bigint {
  return poseidonHashMany([REG_TAG, secret]);
}

export function computeLeaf(commitment: bigint, token: bigint, total: bigint): bigint {
  return poseidonHashMany([LEAF_TAG, commitment, token, total]);
}

/** Sorted-pair Poseidon hash — same rule as Cairo's `hash_pair`. */
export function hashPair(a: bigint, b: bigint): bigint {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return poseidonHashMany([lo, hi]);
}

export function verifyProof(leaf: bigint, proof: bigint[], root: bigint): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed === root;
}
