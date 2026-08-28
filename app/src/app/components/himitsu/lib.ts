"use client";
import { hash, num, walletV6, type WalletAccountV6 } from "starknet";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
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

// ─── Wallet API gate (version query — NEVER a data probe) ──

export async function strk20Supported(wallet: WalletWithStarknetFeatures): Promise<boolean> {
  try {
    const versions = (await walletV6.supportedWalletApi(wallet)) as string[];
    return versions.some((v) => {
      const [maj = 0, min = 0] = v.split(".").map(Number);
      return maj > 0 || min >= 10;
    });
  } catch {
    return false;
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

export function toHex(v: bigint | string | number): string {
  return num.toHex(v as never);
}

export type WA = WalletAccountV6;
