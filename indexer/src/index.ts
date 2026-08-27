import { parseArgs } from "node:util";
import { fetchEventsInRange, getBlockNumber, decodeDeposit, decodeRegistered } from "./rpc.ts";
import { getSelectorFromName } from "./selector.ts";
import { loadStore, saveStore, storePathFor } from "./store.ts";

/** Pool deployment block (ARCHITECTURE.md, verified against mainnet RPC). */
const POOL_GENESIS_BLOCK = 8978970;
const POLL_INTERVAL_MS = 30_000;

async function indexOnce(opts: { rpcUrl: string; pool: string; depositSel: string; vault: string }): Promise<void> {
  const storePath = storePathFor(opts.vault);
  const store = loadStore(storePath);
  const fromBlock = store.lastIndexedBlock + 1 || POOL_GENESIS_BLOCK;
  const toBlock = await getBlockNumber(opts.rpcUrl);

  if (fromBlock > toBlock) {
    console.log(`index: already caught up to block ${toBlock}`);
    return;
  }

  console.log(`index: fetching blocks ${fromBlock}..${toBlock}`);

  const [depositEvents, registeredEvents] = await Promise.all([
    fetchEventsInRange(opts.rpcUrl, { address: opts.pool, keys: [[opts.depositSel]], fromBlock, toBlock }),
    fetchEventsInRange(opts.rpcUrl, {
      address: opts.vault,
      keys: [[getSelectorFromName("Registered").toString()]],
      fromBlock,
      toBlock,
    }),
  ]);

  store.deposits.push(...depositEvents.map(decodeDeposit));
  store.registrations.push(...registeredEvents.map(decodeRegistered));
  store.lastIndexedBlock = toBlock;
  saveStore(storePath, store);

  console.log(
    `index: +${depositEvents.length} deposits, +${registeredEvents.length} registrations ` +
      `(totals: ${store.deposits.length} deposits, ${store.registrations.length} registrations)`,
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      once: { type: "boolean", default: false },
      watch: { type: "boolean", default: false },
      pool: { type: "string" },
      "deposit-sel": { type: "string" },
      vault: { type: "string" },
    },
  });

  const rpcUrl = process.env.STARKNET_RPC_URL;
  if (!rpcUrl) throw new Error("STARKNET_RPC_URL is not set (see .env.example)");
  if (!values.pool) throw new Error("--pool is required");
  if (!values["deposit-sel"]) throw new Error("--deposit-sel is required");
  if (!values.vault) throw new Error("--vault is required");

  const opts = { rpcUrl, pool: values.pool, depositSel: values["deposit-sel"], vault: values.vault };

  if (values.watch) {
    for (;;) {
      await indexOnce(opts).catch((err) => console.error("index: pass failed:", err));
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } else {
    await indexOnce(opts);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
