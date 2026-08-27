import { keccak_256 } from "@noble/hashes/sha3.js";

/** 2^250 - 1, per Starknet's selector-masking convention. */
const MASK_250 = (1n << 250n) - 1n;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}

/**
 * Starknet event/function selector: `keccak256(utf8(name)) & (2^250 - 1)`.
 * Verified in poseidon.test.ts-adjacent selector.test.ts against the pool's real `Deposit`
 * selector from ARCHITECTURE.md (`0x9149d21...`) — this is not a guess, it reproduces a
 * known-correct value.
 */
export function getSelectorFromName(name: string): bigint {
  const hash = keccak_256(new TextEncoder().encode(name));
  return bytesToBigInt(hash) & MASK_250;
}
