"use client";
import { hash, num, type WalletAccountV6 } from "starknet";
import { REG_TAG, LEAF_TAG, myFrontendProviders } from "@/utils/constants";

// ─── Poseidon (must mirror contracts/src/poseidon.cairo; parity via epochs/vectors.json) ──

export function computeCommitment(secret: bigint): bigint {
  return BigInt(hash.computePoseidonHashOnElements([REG_TAG, secret]));
}

export function computeLeaf(commitment: bigint, token: bigint, total: bigint): bigint {
  return BigInt(hash.computePoseidonHashOnElements([LEAF_TAG, commitment, token, total]));
}

/** 31 random bytes → always a valid felt252 (< 2^248 < the STARK prime). */
export function randomSecret(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
}

// ─── Secret storage (per-browser convenience; the download is the real backup) ──

export interface SavedSecret {
  secret: string;      // hex
  commitment: string;  // hex
  token: string;
  amount: string;      // raw base units, decimal string
  createdAt: string;
}

const LS_KEY = "himitsu.secrets.v1";

export function loadSecrets(): SavedSecret[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as SavedSecret[];
  } catch {
    return [];
  }
}

export function saveSecret(entry: SavedSecret): void {
  try {
    const all = loadSecrets().filter((s) => s.commitment !== entry.commitment);
    all.push(entry);
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable (private window etc.) — the download button still works
  }
}

export function downloadSecrets(entries: SavedSecret[]): void {
  const blob = new Blob([JSON.stringify({ himitsu: "v1", warning: "Anyone with a secret can claim its rewards. Keep this file private.", secrets: entries }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `himitsu-secrets-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Wallet API capability probe ──
//
// A version-number check is a weak signal — a wallet can claim a compatible version without
// the STRK20 methods actually working (we hit exactly this: a version check would have
// passed, but the deposit call itself failed with "Not implemented"). Real capability
// detection means calling a real STRK20 method and interpreting the failure — same pattern
// independently converged on by another team building on this same pool
// (github.com/notcodesid/kairo), including the specific error strings: NOT_REGISTERED means
// the method exists but the wallet has no viewing key set up yet (Ready sets this up on a
// user's first in-wallet shield — there's no dapp-side register call), vs. any other failure
// meaning the wallet doesn't speak STRK20 at all.
//
// Call this ONCE, right after connecting — never on a poll/timer. A background wallet call
// made while a real approval could be in flight is a documented way to resurface stale
// prompts (github.com/starkience/strk20-hackathon issue #190).
export type Strk20Support = "unknown" | "supported" | "unregistered" | "unsupported";

export async function probeStrk20(wa: WalletAccountV6, token: string): Promise<Strk20Support> {
  try {
    await wa.strk20Balances([token] as never);
    return "supported";
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return /NOT_REGISTERED/i.test(msg) ? "unregistered" : "unsupported";
  }
}

// ─── Submission plumbing (kit pattern: wait on the FRONTEND provider, never
//     myWalletAccount.provider, which is frozen at connect time) ──

export interface ActionResult {
  label: string;
  status: "pending" | "ok" | "error";
  txHash?: string;
  detail?: string;
}

export async function waitTx(providerIndex: number, txHash: string): Promise<void> {
  await myFrontendProviders[providerIndex].waitForTransaction(txHash, { retries: 400, retryInterval: 3000 } as never);
}

// ─── Independent on-chain watchers (race against wallet calls that can hang) ──
//
// A wallet's own strk20InvokeTransaction/execute promise can complete on-chain — visible in
// the wallet's own activity feed — without ever resolving back to this page. Observed
// directly, not hypothetical. Racing that promise against directly polling for the resulting
// event means a hung wallet promise no longer blocks the flow: whichever settles first wins.

interface RawStarknetEvent {
  keys: string[];
  data: string[];
  transaction_hash: string;
}

const POLL_MS = 5_000;

/** Polls one contract's events for a match, starting from `fromBlock`. Never rejects on its
 *  own — a transient RPC hiccup just means "keep polling" — because this only ever wins a
 *  Promise.race by finding the real event; if it could also lose the race by throwing, a
 *  flaky RPC call could fail a flow whose wallet call is still quietly succeeding. */
async function pollForEvent(
  providerIndex: number,
  address: string,
  selector: string,
  fromBlock: number,
  matches: (keys: string[], data: string[]) => boolean,
): Promise<{ transaction_hash: string }> {
  const provider = myFrontendProviders[providerIndex];
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    try {
      // getEvents, not the low-level fetch() escape hatch: fetch()'s actual runtime behavior
      // didn't match its own type declaration when this got tested directly against live RPC
      // (empty/malformed results, not the documented shape) — getEvents is the properly-typed,
      // properly-behaved public method for this and was verified directly to return real data.
      // to_block "latest", not "pending": this RPC spec version renamed that tag to
      // "pre_confirmed" — "pending" fails with "Invalid block id" on every call. "latest" also
      // avoids acting on a block that could still reorg, which a polling loop doesn't need
      // anyway. Verified end-to-end against a real historical deposit before this fix landed.
      const res = (await provider.getEvents({
        address,
        keys: [[selector]],
        from_block: { block_number: fromBlock },
        to_block: "latest",
        chunk_size: 100,
      } as never)) as { events: RawStarknetEvent[] };
      const hit = res.events.find((ev) => matches(ev.keys, ev.data));
      if (hit) return { transaction_hash: hit.transaction_hash };
    } catch (e) {
      // Still never reject (see doc comment above) — but log it, so a *systematic* failure
      // (wrong params shape, bad selector, etc.) is at least visible instead of indistinguishable
      // from a merely-slow, still-working poll.
      console.warn("[himitsu] watcher poll failed, retrying:", e);
    }
  }
}

/** verified selector — ARCHITECTURE.md / indexer/src/rpc.ts (`Deposit { user_addr (key),
 *  token (key) } -> data=[amount]`). Same on mainnet and Sepolia (confirmed over RPC). */
const DEPOSIT_SELECTOR = "0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2";

export function watchForDeposit(
  providerIndex: number,
  pool: string,
  userAddress: bigint,
  token: bigint,
  amount: bigint,
  fromBlock: number,
): Promise<{ transaction_hash: string }> {
  return pollForEvent(providerIndex, pool, DEPOSIT_SELECTOR, fromBlock, (keys, data) => {
    // keys = [selector, user_addr, token], data = [amount] — decodeDeposit's shape.
    return BigInt(keys[1] ?? "0") === userAddress && BigInt(keys[2] ?? "0") === token && BigInt(data[0] ?? "0") === amount;
  });
}

/** Commitment is an exact match (unlike amount, which several depositors could share), so no
 *  address/token filtering needed beyond it. */
export function watchForRegistration(
  providerIndex: number,
  vaultAddr: string,
  commitment: bigint,
  fromBlock: number,
): Promise<{ transaction_hash: string }> {
  const registeredSelector = hash.getSelectorFromName("Registered");
  return pollForEvent(providerIndex, vaultAddr, registeredSelector, fromBlock, (keys) => {
    // keys = [selector, caller, commitment] — decodeRegistered's shape.
    return BigInt(keys[2] ?? "0") === commitment;
  });
}

export function toHex(v: bigint | string | number): string {
  return num.toHex(v as never);
}

/** Decimal STRK string (e.g. "0.1", "1,000") -> base units (18 decimals), as exact integer
 *  arithmetic on the digit string — never `Number(x) * 1e18`, which loses precision for
 *  amounts that don't round-trip through a float. Excess decimal digits are truncated, not
 *  rounded (matches how on-chain amounts are always whole base units). */
export function parseUnits(amount: string, decimals = 18): bigint {
  const cleaned = amount.trim().replace(/,/g, "");
  if (!cleaned) return 0n;
  const [wholeRaw = "", fracRaw = ""] = cleaned.split(".");
  const whole = wholeRaw || "0";
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole + frac);
}

export type WA = WalletAccountV6;
