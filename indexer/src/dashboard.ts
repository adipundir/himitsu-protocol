import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { loadStore, storePathFor } from "./store.ts";
import { computeRunningDepth } from "./depth.ts";

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

  const output = {
    generatedAt: new Date().toISOString(),
    vault,
    buckets: Object.fromEntries(finalDepth),
    series: points.map((p) => ({ block: p.blockNumber, bucket: p.bucket, depth: p.depthAfter })),
  };

  const outPath = values.out ?? path.join(import.meta.dirname, "..", "..", "dashboard", "depth.json");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`dashboard: wrote ${outPath} (${finalDepth.size} buckets, ${points.length} deposits indexed)`);
}

main();
