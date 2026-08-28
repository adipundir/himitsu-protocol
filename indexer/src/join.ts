import type { DepositEvent, RegisteredEvent, JoinedRegistration } from "./types.ts";
import { compareChainOrderThen } from "./order.ts";

/**
 * "Same address, deposit <= register block, nearest unconsumed." Each deposit funds at most
 * one registration: for every `Registered` event (processed in chain order), pick the closest
 * not-yet-claimed deposit from the same address at or before that block.
 *
 * All ordering ties break on consensus data (block, txHash, then amount/commitment) — see
 * order.ts — so the join, and everything downstream of it, is a pure function of the event set.
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
  const depositOrder = compareChainOrderThen<DepositEvent>((d) => d.amount);
  for (const arr of byAddress.values()) arr.sort(depositOrder);

  const consumed = new Set<DepositEvent>();
  const results: JoinedRegistration[] = [];
  const sortedRegs = [...registrations].sort(compareChainOrderThen<RegisteredEvent>((r) => r.commitment));

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
      registerTxHash: reg.txHash,
    });
  }

  return results;
}

/**
 * Earliest-registration-wins dedupe per commitment. A commitment is public the moment it is
 * registered, so an attacker can re-register a victim's commitment against the attacker's own
 * deposit; the merkle leaf binds (commitment, token, total) with no address, so letting a
 * later duplicate through would overwrite the victim's allocation with a poisoned one. The
 * earliest Registered event (chain order, txHash tie-break) is the only one that can belong to
 * the secret's real owner — later copies are dropped and reported.
 */
export function dedupeByCommitment(joined: JoinedRegistration[]): {
  kept: JoinedRegistration[];
  dropped: JoinedRegistration[];
} {
  const order = compareChainOrderThen<{ blockNumber: number; txHash: string; commitment: bigint }>(
    (x) => x.commitment,
  );
  const best = new Map<string, JoinedRegistration>();
  const dropped: JoinedRegistration[] = [];
  for (const j of joined) {
    const key = j.commitment.toString();
    const prev = best.get(key);
    if (!prev) {
      best.set(key, j);
      continue;
    }
    const jOrd = { blockNumber: j.registerBlock, txHash: j.registerTxHash, commitment: j.commitment };
    const pOrd = { blockNumber: prev.registerBlock, txHash: prev.registerTxHash, commitment: prev.commitment };
    if (order(jOrd, pOrd) < 0) {
      dropped.push(prev);
      best.set(key, j);
    } else {
      dropped.push(j);
    }
  }
  return { kept: [...best.values()], dropped };
}
