import type { DepositEvent, RegisteredEvent, JoinedRegistration } from "./types.ts";

/**
 * "Same address, deposit <= register block, nearest unconsumed" (IMPLEMENTATION_PLAN.md Phase
 * 2). Each deposit funds at most one registration: for every `Registered` event (processed in
 * block order), pick the closest not-yet-claimed deposit from the same address at or before
 * that block.
 */
export function joinDepositsAndRegistrations(
  deposits: DepositEvent[],
  registrations: RegisteredEvent[],
): JoinedRegistration[] {
  const byAddress = new Map<string, DepositEvent[]>();
  for (const d of deposits) {
    const key = d.userAddress.toString();
    const arr = byAddress.get(key);
    if (arr) arr.push(d);
    else byAddress.set(key, [d]);
  }
  for (const arr of byAddress.values()) arr.sort((a, b) => a.blockNumber - b.blockNumber);

  const consumed = new Set<DepositEvent>();
  const results: JoinedRegistration[] = [];
  const sortedRegs = [...registrations].sort((a, b) => a.blockNumber - b.blockNumber);

  for (const reg of sortedRegs) {
    const candidates = byAddress.get(reg.caller.toString()) ?? [];
    let nearest: DepositEvent | undefined;
    for (const d of candidates) {
      if (d.blockNumber > reg.blockNumber) break;
      if (consumed.has(d)) continue;
      nearest = d;
    }
    if (!nearest) continue;
    consumed.add(nearest);
    results.push({
      commitment: reg.commitment,
      caller: reg.caller,
      token: nearest.token,
      amount: nearest.amount,
      depositBlock: nearest.blockNumber,
      depositTxHash: nearest.txHash,
      registerBlock: reg.blockNumber,
    });
  }

  return results;
}
