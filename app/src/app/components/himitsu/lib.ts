"use client";
import { hash, num, shortString, type WalletAccountV6 } from "starknet";
import { REG_TAG, LEAF_TAG, myFrontendProviders, STANDARD_DENOMS } from "@/utils/constants";

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

// ─── Wallet-derived claim secrets ────────────────────────────────────────────
// Browser storage is a cache, not custody: users claim weeks after depositing, often from a
// different browser, and localStorage is readable by any XSS. So the secret derives from the
// one credential the user actually keeps, their wallet: one free SNIP-12 signature yields a
// master key, and per-session secrets are poseidon(master, index). Any device that can sign
// the same message re-derives every secret. The download stays as the backup for the one
// failure mode derivation cannot survive, the wallet rotating its signing keys.

const DERIVE_TAG = BigInt(shortString.encodeShortString("HIMITSU_DERIVE:V1"));

/** SNIP-12 message the master key derives from. Bound to chain + vault so networks and vault
 *  deployments derive independent secrets. Must never change for v1: a changed message means
 *  different signatures and unrecoverable secrets. */
export function claimKeyTypedData(chainId: string, vault: string) {
  return {
    types: {
      StarkNetDomain: [
        { name: "name", type: "felt" },
        { name: "version", type: "felt" },
        { name: "chainId", type: "felt" },
      ],
      ClaimKey: [
        { name: "purpose", type: "felt" },
        { name: "vault", type: "felt" },
      ],
    },
    primaryType: "ClaimKey",
    domain: { name: "Himitsu", version: "1", chainId },
    message: { purpose: "claim-secret-v1", vault },
  };
}

let masterCache: { address: string; chainId: string; vault: string; master: bigint } | null = null;

/** One wallet signature per session (cached in memory only) → the derivation master. */
export async function getClaimMaster(
  account: WalletAccountV6,
  address: string,
  chainId: string,
  vault: string,
): Promise<bigint> {
  if (
    masterCache &&
    masterCache.address === address &&
    masterCache.chainId === chainId &&
    masterCache.vault === vault
  ) {
    return masterCache.master;
  }
  const sig = await account.signMessage(claimKeyTypedData(chainId, vault) as never);
  const parts = (Array.isArray(sig) ? sig : [(sig as { r: bigint }).r, (sig as { s: bigint }).s]).map(
    (x) => BigInt(x as never),
  );
  const master = BigInt(hash.computePoseidonHashOnElements([DERIVE_TAG, ...parts]));
  masterCache = { address, chainId, vault, master };
  return master;
}

export function secretAtIndex(master: bigint, index: number): bigint {
  return BigInt(hash.computePoseidonHashOnElements([DERIVE_TAG, master, BigInt(index)]));
}

/** Every commitment this caller has ever registered on the vault, straight from chain
 *  (Registered keys = [selector, caller, commitment], so the RPC filters server-side). */
export async function fetchRegisteredCommitments(
  providerIndex: number,
  vaultAddr: string,
  caller: string,
): Promise<Set<string>> {
  const provider = myFrontendProviders[providerIndex] as unknown as {
    getEvents: (f: object) => Promise<{ events?: { keys?: string[] }[]; continuation_token?: string }>;
  };
  const registeredSelector = hash.getSelectorFromName("Registered");
  const out = new Set<string>();
  let token: string | undefined;
  do {
    const page = await provider.getEvents({
      address: vaultAddr,
      keys: [[registeredSelector], [num.toHex(BigInt(caller))]],
      from_block: { block_number: 0 },
      to_block: "latest",
      chunk_size: 100,
      continuation_token: token,
    });
    for (const e of page.events ?? []) {
      const c = e.keys?.[2];
      if (c) out.add(num.toHex(BigInt(c)));
    }
    token = page.continuation_token;
  } while (token);
  return out;
}

/** Smallest derivation index whose commitment is not already registered. Reusing a
 *  registered index would dedupe to a no-op registration and the session's deposits
 *  (which must precede their registration) would earn nothing. */
export function nextSecretIndex(master: bigint, registered: Set<string>): number {
  for (let i = 0; i < 256; i++) {
    const c = num.toHex(computeCommitment(secretAtIndex(master, i)));
    if (!registered.has(c)) return i;
  }
  throw new Error("No free claim key index below 256.");
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

/** (epoch_id, leaf) is an exact match for one allocation — no token/payout filtering needed
 *  beyond it (vault ABI: Claimed{ epoch_id (key), leaf (key), token, payout }). */
export function watchForClaim(
  providerIndex: number,
  vaultAddr: string,
  epochId: bigint,
  leaf: bigint,
  fromBlock: number,
): Promise<{ transaction_hash: string }> {
  const claimedSelector = hash.getSelectorFromName("Claimed");
  return pollForEvent(providerIndex, vaultAddr, claimedSelector, fromBlock, (keys) => {
    // keys = [selector, epoch_id, leaf] — Claimed's shape.
    return BigInt(keys[1] ?? "0") === epochId && BigInt(keys[2] ?? "0") === leaf;
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

/** Base units -> decimal STRK string with trailing zeros trimmed (4440000000000000000n
 *  -> "4.44"). Exact: no float ever touches the value. */
export function formatUnits(raw: bigint, decimals = 18): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

// ─── Split planner (custom amount → standard denomination pieces) ──
//
// Denominations only matter at the pool's public edges, where amount-correlation is the
// attack (ARCHITECTURE.md "Two personas, one primitive"). A custom amount is therefore
// split greedily, largest denomination first, into standard pieces; whatever is left below
// the smallest denomination STAYS IN THE WALLET and is never deposited — a sub-10 tail
// entering the pool would be exactly the distinctive amount the split exists to avoid.

export interface SplitPiece {
  /** Human units, e.g. 1_000. */
  denomination: number;
  /** Base units for ONE piece of this denomination. */
  amount: bigint;
  count: number;
}

export interface SplitPlan {
  /** Largest denomination first; only denominations with count > 0. */
  pieces: SplitPiece[];
  /** Total number of deposits in the batch. */
  pieceCount: number;
  /** Base units actually entering the pool (sum of all pieces). */
  depositTotal: bigint;
  /** Base units staying in the wallet — always < the smallest standard denomination. */
  remainder: bigint;
}

/** Pure. Returns null for garbage, zero, or anything below the smallest denomination —
 *  callers treat null as "nothing to shield". All arithmetic is exact base-unit bigint
 *  via parseUnits (444.44 -> 4×100 + 4×10, remainder 4.44). */
export function planSplit(amount: string, decimals = 18): SplitPlan | null {
  let raw: bigint;
  try {
    raw = parseUnits(amount, decimals);
  } catch {
    return null; // non-numeric input that never went through the picker's sanitizer
  }
  if (raw <= 0n) return null;
  const pieces: SplitPiece[] = [];
  let remaining = raw;
  for (const denomination of [...STANDARD_DENOMS].sort((a, b) => b - a)) {
    const unit = BigInt(denomination) * 10n ** BigInt(decimals);
    const count = Number(remaining / unit);
    if (count > 0) {
      pieces.push({ denomination, amount: unit, count });
      remaining -= unit * BigInt(count);
    }
  }
  if (!pieces.length) return null;
  return {
    pieces,
    pieceCount: pieces.reduce((n, p) => n + p.count, 0),
    depositTotal: raw - remaining,
    remainder: remaining,
  };
}

export type WA = WalletAccountV6;
