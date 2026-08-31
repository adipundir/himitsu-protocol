import type { DepositEvent, RegisteredEvent, JoinedRegistration } from "./types.ts";
import { compareChainOrder, compareChainOrderThen } from "./order.ts";
import { matchedDenomination } from "./gauge.ts";

/**
 * Which deposits a Registered event consumes. Selected per epoch in epoch-close.ts
 * (JOIN_RULE_V2_FROM_EPOCH) and recorded in the epoch file, so a verifier knows which rule
 * reproduces a published root. Rule 1: nearest unconsumed same-address deposit at or before
 * the register block. Rule 2 (session aggregation): ALL unconsumed same-address deposits at
 * or before the register block, one row per (registration, deposit) pair.
 */
export type JoinRule = 1 | 2;

/**
 * "Same address, deposit <= register block, unconsumed." Registrations are processed in chain
 * order; under rule 1 each takes the closest not-yet-claimed deposit from the same address at
 * or before its block, under rule 2 it takes every such deposit (a "shield any amount" split
 * lands several standard pieces before one register call, and all of them deepen the set).
 * The at-or-before direction is load-bearing under both rules: a registration can never reach
 * forward to a deposit that lands after it, which is what makes a used (public) secret
 * worthless for funding future deposits. Two registrations from one address in one window
 * partition deposits by time — the earlier consumes what precedes it, the later consumes what
 * lands between them.
 *
 * All ordering ties break on consensus data (block, txHash, then amount/commitment) — see
 * order.ts — so the join, and everything downstream of it, is a pure function of the event set.
 */
export function joinDepositsAndRegistrations(
  deposits: DepositEvent[],
  registrations: RegisteredEvent[],
  rule: JoinRule,
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
    const matched: DepositEvent[] = [];
    for (const d of candidates) {
      if (d.blockNumber > reg.blockNumber) break;
      if (consumed.has(d)) continue;
      // Rule 1 keeps only the nearest (last-seen) candidate; rule 2 keeps them all.
      if (rule === 1) matched[0] = d;
      else matched.push(d);
    }
    for (const d of matched) {
      consumed.add(d);
      results.push({
        commitment: reg.commitment,
        caller: reg.caller,
        token: d.token,
        amount: d.amount,
        depositBlock: d.blockNumber,
        depositTxHash: d.txHash,
        registerBlock: reg.blockNumber,
        registerTxHash: reg.txHash,
      });
    }
  }

  return results;
}

/**
 * Earliest-registration-EVENT-wins dedupe per commitment. A commitment is public the moment it
 * is registered, so an attacker can re-register a victim's commitment against the attacker's
 * own deposit; the merkle leaf binds (commitment, token, total) with no address, so letting a
 * later duplicate through would overwrite the victim's allocation with a poisoned one.
 * Earliest-wins is a deterministic heuristic, not proof of ownership: a mempool front-runner
 * who copies the commitment before the owner's tx lands IS the earliest event. That residual
 * risk is accepted and documented (ARCHITECTURE.md's mempool note — low feasibility on
 * today's Starknet; the robust fix is the roadmap's ZK owner binding).
 *
 * Under rule >= 2, "earliest" is additionally restricted to registration events backed by at
 * least one standard-denomination row (matchedDenomination defined), falling back to plain
 * earliest when none qualify. Without this, a 1-wei same-token deposit plus a copied
 * commitment would outrank a victim's entire multi-piece session — non-standard amounts still
 * produce join rows and are only zeroed at the multiplier stage, so dust was enough to win.
 * Rule 1 keeps the original plain-earliest semantics: epoch 1 is published history and must
 * re-run byte-identical (JOIN_RULE_V2_FROM_EPOCH in epoch-close.ts).
 *
 * Callers that filter by token before deduping (epoch-close.ts does) get PER-TOKEN
 * earliest-event semantics: duplicate events that produced rows only in other tokens never
 * enter the contest.
 *
 * Under join rule 2 one Registered event legitimately yields several rows for the same
 * commitment (one per consumed deposit). Those are siblings, not duplicates: rows are grouped
 * by commitment, registration events are identified by (registerBlock, registerTxHash), and
 * EVERY row of the winning event is kept.
 */
export function dedupeByCommitment(
  joined: JoinedRegistration[],
  rule: JoinRule,
): {
  kept: JoinedRegistration[];
  dropped: JoinedRegistration[];
} {
  const byCommitment = new Map<string, JoinedRegistration[]>();
  for (const j of joined) {
    const key = j.commitment.toString();
    const arr = byCommitment.get(key);
    if (arr) arr.push(j);
    else byCommitment.set(key, [j]);
  }
  const kept: JoinedRegistration[] = [];
  const dropped: JoinedRegistration[] = [];
  for (const rows of byCommitment.values()) {
    // Rule >= 2: only events with a standard-denomination row can win; dust can't outrank a
    // real session. Qualification is per EVENT — one standard row qualifies all its siblings.
    let candidates = rows;
    if (rule >= 2) {
      const eventKey = (r: JoinedRegistration) => `${r.registerBlock}:${r.registerTxHash}`;
      const qualifying = new Set(
        rows.filter((r) => matchedDenomination(r.token, r.amount) !== undefined).map(eventKey),
      );
      const backed = rows.filter((r) => qualifying.has(eventKey(r)));
      if (backed.length > 0) candidates = backed;
    }
    let earliest = candidates[0]!;
    for (const r of candidates) {
      if (
        compareChainOrder(
          { blockNumber: r.registerBlock, txHash: r.registerTxHash },
          { blockNumber: earliest.registerBlock, txHash: earliest.registerTxHash },
        ) < 0
      ) {
        earliest = r;
      }
    }
    for (const r of rows) {
      const sameEvent = r.registerBlock === earliest.registerBlock && r.registerTxHash === earliest.registerTxHash;
      (sameEvent ? kept : dropped).push(r);
    }
  }
  return { kept, dropped };
}
