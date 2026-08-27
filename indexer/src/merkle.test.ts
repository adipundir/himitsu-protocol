import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMerkleTree, proofFor } from "./merkle.ts";
import { verifyProof } from "./poseidon.ts";

for (const size of [1, 2, 3, 4, 5, 7, 8, 13]) {
  test(`every leaf verifies its own proof against the root (n=${size})`, () => {
    const leaves = Array.from({ length: size }, (_, i) => BigInt(i + 1) * 1000003n);
    const tree = buildMerkleTree(leaves);
    for (let i = 0; i < size; i++) {
      const proof = proofFor(tree, i);
      assert.ok(verifyProof(leaves[i]!, proof, tree.root), `leaf ${i} of ${size} failed to verify`);
    }
  });
}

test("a proof for the wrong leaf is rejected", () => {
  const leaves = [10n, 20n, 30n, 40n];
  const tree = buildMerkleTree(leaves);
  const proofForLeaf0 = proofFor(tree, 0);
  assert.ok(!verifyProof(leaves[1]!, proofForLeaf0, tree.root));
});

test("matches the Cairo-verified 4-leaf vectors exactly", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const vectorsPath = path.join(import.meta.dirname, "..", "..", "epochs", "vectors.json");
  const vectors: Record<string, string> = JSON.parse(readFileSync(vectorsPath, "utf8"));
  const leaves = [0, 1, 2, 3].map((i) => BigInt(vectors[`leaf_${i}`]!));
  const tree = buildMerkleTree(leaves);
  assert.equal(tree.root, BigInt(vectors.root!));
});
