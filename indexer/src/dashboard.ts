import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { loadStore, storePathFor } from "./store.ts";
import { computeRunningDepth } from "./depth.ts";
import { STANDARD_DENOMINATIONS, baseUnit, gaugeMultiplierX10 } from "./gauge.ts";
import { heatStopForDepth } from "./heat.ts";

/**
 * Depth-per-(token,denomination)-bucket dashboard data, read from whatever index.ts has already
 * captured locally (no RPC calls here). The Makefile's `dashboard-data` target passes no flags,
 * so --vault falls back to deployments/mainnet.json (same address the Makefile itself reads
 * VAULT from) — override with --vault for local testing before deployment exists.
 */

function resolveVault(explicit?: string): string {
  if (explicit) return explicit;
  const deploymentsPath = path.join(import.meta.dirname, "..", "..", "deployments", "mainnet.json");
  if (!existsSync(deploymentsPath)) {
    throw new Error(`--vault not given and ${deploymentsPath} does not exist yet`);
  }
  const deployment = JSON.parse(readFileSync(deploymentsPath, "utf8")) as { vault: string };
  return deployment.vault;
}

function main(): void {
  const { values } = parseArgs({ options: { vault: { type: "string" }, out: { type: "string" } } });
  const vault = resolveVault(values.vault);
  const store = loadStore(storePathFor(vault));

  const points = computeRunningDepth(store.deposits);

  const finalDepth = new Map<string, number>();
  for (const p of points) finalDepth.set(p.bucket, p.depthAfter);

  // Per-standard-bucket multiplier/heat, computed once here so the app never re-derives gauge
  // thresholds itself (DESIGN.md §9: "Thresholds live in one place in the indexer").
  const gauges = [];
  for (const [bucket, depth] of finalDepth) {
    const [tokenStr, denomStr] = bucket.split(":");
    if (denomStr === "non-standard") continue;
    const token = BigInt(tokenStr!);
    const denomination = BigInt(denomStr!);
    if (!STANDARD_DENOMINATIONS.includes(denomination as (typeof STANDARD_DENOMINATIONS)[number])) continue;
    const amount = denomination * baseUnit(token);
    gauges.push({
      token: `0x${token.toString(16)}`,
      denomination: Number(denomination),
      depth,
      multiplier: Number(gaugeMultiplierX10(token, amount, depth)) / 10,
      heat: heatStopForDepth(depth),
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    vault,
    buckets: Object.fromEntries(finalDepth),
    gauges,
    series: points.map((p) => ({ block: p.blockNumber, bucket: p.bucket, depth: p.depthAfter })),
  };

  const outPath = values.out ?? path.join(import.meta.dirname, "..", "..", "dashboard", "depth.json");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`dashboard: wrote ${outPath} (${finalDepth.size} buckets, ${points.length} deposits indexed)`);
}

main();
