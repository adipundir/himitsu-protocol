import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

/**
 * Re-verifies every transaction hash in strk20.json against mainnet RPC, the same way an
 * external checker would: the tx must exist, have SUCCEEDED, have touched the STRK20 pool, and
 * have run through our own vault. Run via `make verify-txs` before publishing — a hash that
 * fails here is a hash that fails independent verification.
 */

const { values } = parseArgs({
  options: {
    strk20: { type: "string" }, pool: { type: "string" }, vault: { type: "string" },
    rpc: { type: "string" },
  },
});

const RPC = values.rpc ?? process.env.STARKNET_RPC_URL ?? "https://rpc.starknet.lava.build";
const pool = BigInt(values.pool!);
const vault = values.vault && values.vault !== "0x0" ? BigInt(values.vault) : undefined;
const strk20 = JSON.parse(readFileSync(values.strk20 ?? "strk20.json", "utf8")) as { transactions: string[] };

async function rpc(method: string, params: unknown): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

let failures = 0;
for (const txHash of strk20.transactions) {
  try {
    const receipt = await rpc("starknet_getTransactionReceipt", { transaction_hash: txHash });
    const succeeded = receipt.execution_status === "SUCCEEDED";
    const froms = new Set<string>((receipt.events ?? []).map((e: { from_address: string }) => BigInt(e.from_address).toString()));
    const touchedPool = froms.has(pool.toString());
    const throughVault = vault === undefined ? true : froms.has(vault.toString());
    const ok = succeeded && touchedPool && throughVault;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${txHash}  succeeded=${succeeded} pool=${touchedPool} vault=${vault === undefined ? "n/a" : throughVault}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${txHash}  ${(e as Error).message}`);
  }
}
console.log(failures === 0 ? `${strk20.transactions.length}/${strk20.transactions.length} PASS` : `${failures} FAILURE(S)`);
if (failures > 0 || strk20.transactions.length < 3) {
  if (strk20.transactions.length < 3) console.log(`WARNING: only ${strk20.transactions.length} transactions listed — at least 3 are required.`);
  process.exit(1);
}
