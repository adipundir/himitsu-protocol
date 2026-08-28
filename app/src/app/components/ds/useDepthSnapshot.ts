"use client";
import { useEffect, useRef, useState } from "react";
import { TOKEN_LABELS } from "@/utils/constants";
import type { Bucket, DepthSnapshot, HeatStop } from "./types";

interface RawDepthFile {
  generatedAt: string;
  buckets: Record<string, number>;
  gauges: { token: string; denomination: number; depth: number; multiplier: number; heat: HeatStop }[];
}

function tokenSymbol(tokenHex: string): string {
  const decimal = BigInt(tokenHex).toString();
  return TOKEN_LABELS[decimal] ?? `0x${tokenHex.slice(2, 8)}…`;
}

function normalize(raw: RawDepthFile): DepthSnapshot {
  const buckets: Bucket[] = raw.gauges.map((g) => ({
    token: g.token,
    tokenSymbol: tokenSymbol(g.token),
    denomination: g.denomination as Bucket["denomination"],
    depth: g.depth,
    multiplier: g.multiplier,
    heat: g.heat,
  }));

  const nonStandardByToken = new Map<string, number>();
  for (const [bucket, depth] of Object.entries(raw.buckets)) {
    const [tok, denom] = bucket.split(":");
    if (denom !== "non-standard" || !tok) continue;
    nonStandardByToken.set(tok, (nonStandardByToken.get(tok) ?? 0) + depth);
  }
  const nonStandard = [...nonStandardByToken.entries()]
    .map(([tok, depth]) => {
      const hex = `0x${BigInt(tok).toString(16)}`;
      return { token: hex, tokenSymbol: tokenSymbol(hex), depth };
    })
    .sort((a, b) => b.depth - a.depth);

  return { generatedAt: raw.generatedAt, buckets, nonStandard };
}

const POLL_MS = 15_000;

export interface DepthState {
  data: DepthSnapshot | null;
  loading: boolean;
  /** Fetch failed at least once and we have no data to show at all. */
  error: boolean;
  /** We have data, but the most recent refresh failed — show it greyed with a staleness banner. */
  stale: boolean;
}

export function useDepthSnapshot(): DepthState {
  const [state, setState] = useState<DepthState>({ data: null, loading: true, error: false, stale: false });
  const dataRef = useRef<DepthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/epochs/depth.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as RawDepthFile;
        if (cancelled) return;
        const normalized = normalize(raw);
        dataRef.current = normalized;
        setState({ data: normalized, loading: false, error: false, stale: false });
      } catch {
        if (cancelled) return;
        if (dataRef.current) {
          setState({ data: dataRef.current, loading: false, error: false, stale: true });
        } else {
          setState({ data: null, loading: false, error: true, stale: false });
        }
      }
    }

    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}
