import { parseArgs } from "node:util";
import { fetchEventsInRange, getBlockNumber, type StarknetEvent } from "./rpc.ts";
import { getSelectorFromName } from "./selector.ts";

/**
 * Operator CLI backing scripts/qualify.sh: reads the vault's own event log so the runbook
 * script can tell, from chain state alone, which qualification steps have already happened
 * and collect the claim tx hashes without anyone copy-pasting them.
 *
 *   pnpm tsx src/ops.ts status  --vault 0x… --from-block N --rpc URL
 *   pnpm tsx src/ops.ts balance --token 0x… --address 0x… --rpc URL
 *   pnpm tsx src/ops.ts block-of --tx 0x… --rpc URL
 *
 * Every subcommand prints a single JSON object on stdout; nothing else goes to stdout.
 */

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    vault: { type: "string" },
    token: { type: "string" },
    address: { type: "string" },
    tx: { type: "string" },
    rpc: { type: "string" },
    "from-block": { type: "string" },
  },
});

const RPC = values.rpc ?? process.env.STARKNET_RPC_URL ?? "https://rpc.starknet.lava.build";

async function rpcCall(method: string, params: unknown): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} HTTP ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const hex = (n: bigint) => "0x" + n.toString(16);

async function status(): Promise<void> {
  const vault = values.vault!;
  const fromBlock = Number(values["from-block"] ?? 0);
  const head = await getBlockNumber(RPC);
  const events = await fetchEventsInRange(RPC, { address: vault, fromBlock, toBlock: head });

  const sel = {
    funded: hex(getSelectorFromName("Funded")),
    registered: hex(getSelectorFromName("Registered")),
    rootPosted: hex(getSelectorFromName("RootPosted")),
    claimed: hex(getSelectorFromName("Claimed")),
  };
  const byKind = (s: string): StarknetEvent[] =>
    events.filter((e) => e.keys[0] && BigInt(e.keys[0]) === BigInt(s));
  const txsOf = (evs: StarknetEvent[]): string[] => [...new Set(evs.map((e) => e.transaction_hash))];

  console.log(
    JSON.stringify({
      head,
      funded: byKind(sel.funded).length,
      registered: byKind(sel.registered).length,
      registeredTxs: txsOf(byKind(sel.registered)),
      rootsPosted: byKind(sel.rootPosted).length,
      claimed: byKind(sel.claimed).length,
      claimTxs: txsOf(byKind(sel.claimed)),
    }),
  );
}

async function balance(): Promise<void> {
  const result = (await rpcCall("starknet_call", {
    request: {
      contract_address: values.token!,
      entry_point_selector: hex(getSelectorFromName("balanceOf")),
      calldata: [values.address!],
    },
    block_id: "latest",
  })) as string[];
  const raw = BigInt(result[0]) + (BigInt(result[1] ?? "0x0") << 128n);
  console.log(JSON.stringify({ raw: raw.toString(), tokens: Number(raw / 10n ** 15n) / 1000 }));
}

async function blockOf(): Promise<void> {
  const receipt = (await rpcCall("starknet_getTransactionReceipt", { transaction_hash: values.tx! })) as {
    block_number?: number;
    execution_status?: string;
  };
  console.log(
    JSON.stringify({ block: receipt.block_number ?? null, status: receipt.execution_status ?? null }),
  );
}

const cmd = positionals[0];
const run = cmd === "status" ? status : cmd === "balance" ? balance : cmd === "block-of" ? blockOf : null;
if (!run) {
  console.error("usage: ops.ts status|balance|block-of [--vault|--token|--address|--tx] [--from-block N] [--rpc URL]");
  process.exit(2);
}
run().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
