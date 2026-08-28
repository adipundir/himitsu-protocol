"use client";
import { useEffect, useState } from "react";
import { addrSTRK, E18, myFrontendProviders, vaultForIndex } from "@/utils/constants";

const POLL_MS = 60_000;

/**
 * Live reward pot, read straight from chain: the vault's STRK balance. Funding is an
 * irreversible donation and STRK leaves the vault only through claims, so balance == pot.
 * null while unknown (not deployed, RPC unreachable) — callers hide the figure rather than
 * show a made-up one.
 */
export function useRewardPot(providerIndex: number): bigint | null {
  const [pot, setPot] = useState<bigint | null>(null);

  useEffect(() => {
    const vault = vaultForIndex(providerIndex);
    const provider = myFrontendProviders[providerIndex];
    if (!provider || vault === "0x0") {
      setPot(null);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const res = await provider.callContract({
          contractAddress: addrSTRK,
          entrypoint: "balance_of",
          calldata: [vault],
        });
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res as { result: string[] }).result;
        const low = BigInt(arr[0] ?? "0");
        const high = BigInt(arr[1] ?? "0");
        setPot((high << 128n) + low);
      } catch {
        // Leave the last known value (or null): never invent a number.
      }
    }

    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [providerIndex]);

  return pot;
}

/** Whole-STRK display for pot figures. */
export function fmtPotSTRK(pot: bigint): string {
  return (pot / E18).toLocaleString("en-US");
}
