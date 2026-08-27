import { hashPair } from "./poseidon.ts";

/**
 * Sorted-pair Poseidon merkle tree. The contract never builds a tree — `privacy_invoke` only
 * folds a leaf up through a proof via the same `hash_pair` and checks the result against the
 * posted root. So any tree shape built here (including how odd layers are handled) is valid as
 * long as it's internally consistent with `hashPair`, which poseidon.test.ts already proves is
 * bit-for-bit identical to Cairo's.
 */
export interface MerkleTree {
  root: bigint;
  /** layers[0] = leaves, layers[layers.length - 1] = [root]. */
  layers: bigint[][];
}

export function buildMerkleTree(leaves: bigint[]): MerkleTree {
  if (leaves.length === 0) throw new Error("buildMerkleTree: no leaves");
  const layers: bigint[][] = [leaves];
  let layer = leaves;
  while (layer.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      // Odd layer: the unpaired last node carries forward by pairing with itself.
      const right = i + 1 < layer.length ? layer[i + 1]! : left;
      next.push(hashPair(left, right));
    }
    layers.push(next);
    layer = next;
  }
  return { root: layer[0]!, layers };
}

export function proofFor(tree: MerkleTree, leafIndex: number): bigint[] {
  const proof: bigint[] = [];
  let index = leafIndex;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const currentLayer = tree.layers[level]!;
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;
    const sibling = siblingIndex < currentLayer.length ? currentLayer[siblingIndex]! : currentLayer[index]!;
    proof.push(sibling);
    index = Math.floor(index / 2);
  }
  return proof;
}
