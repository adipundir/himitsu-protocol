import type { DepositEvent, RegisteredEvent } from "./types.ts";

export interface StarknetEvent {
  from_address: string;
  keys: string[];
  data: string[];
  block_number: number;
  block_hash: string;
  transaction_hash: string;
}

interface GetEventsResult {
  events: StarknetEvent[];
  continuation_token?: string;
}

/**
 * One `starknet_getEvents` call, paginated to completion via `continuation_token`.
 * `chunkSize` bounds events per page; it does not bound the block range of the query — see
 * `fetchEventsInRange` for that (providers like Lava cap ~81k blocks per call regardless of how
 * few events match).
 */
export async function fetchAllEvents(
  rpcUrl: string,
  params: { address: string; keys?: string[][]; fromBlock: number; toBlock: number; chunkSize?: number },
): Promise<StarknetEvent[]> {
  const events: StarknetEvent[] = [];
  let continuationToken: string | undefined;
  const chunkSize = params.chunkSize ?? 1000;

  do {
    const filter: Record<string, unknown> = {
      from_block: { block_number: params.fromBlock },
      to_block: { block_number: params.toBlock },
      address: params.address,
      keys: params.keys ?? [],
      chunk_size: chunkSize,
    };
    if (continuationToken) filter.continuation_token = continuationToken;

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "starknet_getEvents", params: [filter] }),
    });
    if (!res.ok) throw new Error(`starknet_getEvents HTTP ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { result?: GetEventsResult; error?: { code: number; message: string } };
    if (json.error) throw new Error(`starknet_getEvents RPC error ${json.error.code}: ${json.error.message}`);
    const result = json.result!;
    events.push(...result.events);
    continuationToken = result.continuation_token;
  } while (continuationToken);

  return events;
}

/** Slices a wide block range into provider-safe windows before paginating each with `fetchAllEvents`. */
export async function fetchEventsInRange(
  rpcUrl: string,
  params: { address: string; keys?: string[][]; fromBlock: number; toBlock: number; chunkSize?: number; maxBlockSpan?: number },
): Promise<StarknetEvent[]> {
  const maxSpan = params.maxBlockSpan ?? 80_000;
  const all: StarknetEvent[] = [];
  for (let start = params.fromBlock; start <= params.toBlock; start += maxSpan) {
    const end = Math.min(start + maxSpan - 1, params.toBlock);
    const chunk = await fetchAllEvents(rpcUrl, { ...params, fromBlock: start, toBlock: end });
    all.push(...chunk);
  }
  return all;
}

export async function getBlockNumber(rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "starknet_blockNumber", params: [] }),
  });
  if (!res.ok) throw new Error(`starknet_blockNumber HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: number; error?: { code: number; message: string } };
  if (json.error) throw new Error(`starknet_blockNumber RPC error ${json.error.code}: ${json.error.message}`);
  return json.result!;
}

/** `keys=[selector, user_addr, token]`, `data=[amount:u128]` — verified against mainnet RPC (ARCHITECTURE.md). */
export function decodeDeposit(ev: StarknetEvent): DepositEvent {
  return {
    txHash: ev.transaction_hash,
    blockNumber: ev.block_number,
    userAddress: BigInt(ev.keys[1]!),
    token: BigInt(ev.keys[2]!),
    amount: BigInt(ev.data[0]!),
  };
}

/** `Registered { caller (key), commitment (key) }` -> `keys=[selector, caller, commitment]`, `data=[]`. */
export function decodeRegistered(ev: StarknetEvent): RegisteredEvent {
  return {
    txHash: ev.transaction_hash,
    blockNumber: ev.block_number,
    caller: BigInt(ev.keys[1]!),
    commitment: BigInt(ev.keys[2]!),
  };
}
