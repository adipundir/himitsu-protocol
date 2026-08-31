import { test } from "node:test";
import assert from "node:assert/strict";
import { joinDepositsAndRegistrations, dedupeByCommitment } from "./join.ts";
import type { DepositEvent, RegisteredEvent } from "./types.ts";

const TOKEN = 0xabcn;

function deposit(addr: bigint, block: number, amount: bigint): DepositEvent {
  return { txHash: `0xd${block}`, blockNumber: block, userAddress: addr, token: TOKEN, amount };
}
function registered(addr: bigint, block: number, commitment: bigint): RegisteredEvent {
  return { txHash: `0xe${block}`, blockNumber: block, caller: addr, commitment };
}

// ─── rule 1 (epoch 1, published history — semantics must never change) ──────

test("v1: matches a registration to the nearest preceding deposit from the same address", () => {
  const deposits = [deposit(1n, 100, 1000n)];
  const regs = [registered(1n, 105, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs, 1);
  assert.equal(joined.length, 1);
  assert.equal(joined[0]!.depositBlock, 100);
  assert.equal(joined[0]!.amount, 1000n);
});

test("v1: a registration cannot consume a deposit that happens after it", () => {
  const deposits = [deposit(1n, 200, 1000n)]; // deposit AFTER the registration
  const regs = [registered(1n, 100, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs, 1);
  assert.equal(joined.length, 0);
});

test("v1: each deposit is consumed by at most one registration ('nearest unconsumed')", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 110, 2000n)];
  const regs = [registered(1n, 105, 111n), registered(1n, 120, 222n)];
  const joined = joinDepositsAndRegistrations(deposits, regs, 1);
  assert.equal(joined.length, 2);
  // reg@105 can only see deposit@100 (deposit@110 is after it) -> takes deposit@100
  const first = joined.find((j) => j.commitment === 111n)!;
  assert.equal(first.depositBlock, 100);
  // reg@120 sees both deposits, but deposit@100 is already consumed -> takes deposit@110
  const second = joined.find((j) => j.commitment === 222n)!;
  assert.equal(second.depositBlock, 110);
});

test("v1: a registration takes ONE deposit even when several precede it", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 102, 2000n)];
  const regs = [registered(1n, 105, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs, 1);
  assert.equal(joined.length, 1);
  assert.equal(joined[0]!.depositBlock, 102); // the nearest one
});

test("registrations from a different address never match (both rules)", () => {
  const deposits = [deposit(1n, 100, 1000n)];
  const regs = [registered(2n, 105, 999n)];
  assert.equal(joinDepositsAndRegistrations(deposits, regs, 1).length, 0);
  assert.equal(joinDepositsAndRegistrations(deposits, regs, 2).length, 0);
});

// ─── rule 2 (session aggregation: epochs >= JOIN_RULE_V2_FROM_EPOCH) ────────

test("v2: a registration consumes ALL unconsumed same-address deposits at or before its block", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 102, 2000n), deposit(1n, 104, 1000n)];
  const regs = [registered(1n, 105, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs, 2);
  assert.equal(joined.length, 3);
  assert.deepEqual(joined.map((j) => j.depositBlock), [100, 102, 104]);
  assert.deepEqual(joined.map((j) => j.amount), [1000n, 2000n, 1000n]);
  // Every row is the same (registration, deposit) pairing shape, one per pair.
  for (const j of joined) {
    assert.equal(j.commitment, 999n);
    assert.equal(j.registerBlock, 105);
    assert.equal(j.registerTxHash, "0xe105");
  }
});

test("v2: a registration still cannot consume a deposit that happens after it", () => {
  // The at-or-before direction is what makes a used (public) secret worthless for
  // funding future deposits — it must hold under aggregation too.
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 200, 2000n)];
  const regs = [registered(1n, 105, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs, 2);
  assert.equal(joined.length, 1);
  assert.equal(joined[0]!.depositBlock, 100);
});

test("v2: two sequential sessions from one address partition deposits by time", () => {
  const deposits = [
    deposit(1n, 100, 1000n),
    deposit(1n, 101, 2000n), // session 1
    deposit(1n, 110, 1000n),
    deposit(1n, 111, 3000n), // session 2
  ];
  const regs = [registered(1n, 105, 111n), registered(1n, 120, 222n)];
  const joined = joinDepositsAndRegistrations(deposits, regs, 2);
  assert.equal(joined.length, 4);
  const session1 = joined.filter((j) => j.commitment === 111n);
  const session2 = joined.filter((j) => j.commitment === 222n);
  assert.deepEqual(session1.map((j) => j.depositBlock), [100, 101]);
  assert.deepEqual(session2.map((j) => j.depositBlock), [110, 111]);
});

// ─── dedupeByCommitment (commitment-collision griefing defense) ─────────────

test("dedupe: earliest registration of a commitment wins; later copies are dropped", () => {
  // Victim registers C at block 105 against their own deposit; attacker re-registers the
  // now-public C at block 120 against the attacker's own deposit.
  const deposits = [deposit(1n, 100, 1000n), deposit(2n, 110, 1000n)];
  const regs = [registered(1n, 105, 777n), registered(2n, 120, 777n)];
  const { kept, dropped } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 1), 1);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.caller, 1n);
  assert.equal(kept[0]!.registerBlock, 105);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]!.caller, 2n);
});

test("dedupe: same-block duplicate breaks the tie on txHash, deterministically", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(2n, 100, 1000n)];
  const regA: RegisteredEvent = { txHash: "0xa", blockNumber: 105, caller: 1n, commitment: 777n };
  const regB: RegisteredEvent = { txHash: "0xb", blockNumber: 105, caller: 2n, commitment: 777n };
  const fwd = dedupeByCommitment(joinDepositsAndRegistrations(deposits, [regA, regB], 1), 1);
  const rev = dedupeByCommitment(joinDepositsAndRegistrations(deposits, [regB, regA], 1), 1);
  assert.equal(fwd.kept[0]!.registerTxHash, "0xa"); // lower txHash wins the tie
  assert.equal(rev.kept[0]!.registerTxHash, "0xa"); // regardless of input order
});

test("dedupe: distinct commitments are untouched", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(2n, 110, 1000n)];
  const regs = [registered(1n, 105, 111n), registered(2n, 120, 222n)];
  const { kept, dropped } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 1), 1);
  assert.equal(kept.length, 2);
  assert.equal(dropped.length, 0);
});

test("dedupe: v2 sibling rows from ONE registration event are all kept, never deduped", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 102, 2000n), deposit(1n, 104, 1000n)];
  const regs = [registered(1n, 105, 999n)];
  const { kept, dropped } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 2), 2);
  assert.equal(kept.length, 3);
  assert.equal(dropped.length, 0);
});

test("dedupe: v2 griefing — every row of the earliest event kept, every later-event row dropped", () => {
  // Victim's session is two deposits under one registration of C; attacker re-registers the
  // now-public C later against the attacker's own deposit.
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 102, 2000n), deposit(2n, 110, 1000n)];
  const regs = [registered(1n, 105, 777n), registered(2n, 120, 777n)];
  const { kept, dropped } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 2), 2);
  assert.equal(kept.length, 2);
  for (const k of kept) {
    assert.equal(k.caller, 1n);
    assert.equal(k.registerBlock, 105);
  }
  assert.deepEqual(kept.map((k) => k.depositBlock), [100, 102]);
  // dropped is non-empty exactly when epoch-close fires the griefing warning.
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]!.caller, 2n);
});

// ─── dedupe rule 2: dust-backed duplicates cannot outrank a real session ────

/** 10 STRK in base units — a standard denomination under the default 18 decimals. */
const TEN = 10n * 10n ** 18n;

test("dedupe v2: a dust-backed earlier duplicate loses to a standard-denomination session", () => {
  // Attacker deposits 1 wei, then front-runs the victim's register tx with the copied
  // commitment — the attacker IS the earliest event. Non-standard rows join fine (they are
  // only zeroed at the multiplier stage), so plain-earliest would drop the victim's ENTIRE
  // multi-piece session. Rule 2 requires the winning event to be backed by at least one
  // standard-denomination row.
  const deposits = [deposit(2n, 100, 1n), deposit(1n, 100, TEN), deposit(1n, 100, TEN)];
  const regs = [registered(2n, 104, 777n), registered(1n, 105, 777n)];
  const { kept, dropped } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 2), 2);
  assert.equal(kept.length, 2);
  for (const k of kept) assert.equal(k.caller, 1n);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]!.caller, 2n);
});

test("dedupe v2: one standard row qualifies ALL sibling rows of its event", () => {
  // The victim's session mixes a standard piece with a non-standard tail-era deposit: the
  // standard piece qualifies the event, and every sibling row is kept with it.
  const deposits = [deposit(2n, 100, 1n), deposit(1n, 100, TEN), deposit(1n, 101, 42n)];
  const regs = [registered(2n, 104, 777n), registered(1n, 105, 777n)];
  const { kept } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 2), 2);
  assert.equal(kept.length, 2);
  for (const k of kept) assert.equal(k.caller, 1n);
});

test("dedupe v2: falls back to plain earliest when NO event has a standard row", () => {
  const deposits = [deposit(1n, 100, 999n), deposit(2n, 100, 1n)];
  const regs = [registered(1n, 105, 777n), registered(2n, 110, 777n)];
  const { kept } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 2), 2);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.caller, 1n); // earliest event, nothing eligible will be paid anyway
});

test("dedupe v1: plain earliest wins even over dust — published epoch-1 semantics, frozen", () => {
  const deposits = [deposit(2n, 100, 1n), deposit(1n, 100, TEN)];
  const regs = [registered(2n, 104, 777n), registered(1n, 105, 777n)];
  const { kept } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs, 1), 1);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.caller, 2n);
});

// ─── determinism: the join is a pure function of the event SET ──────────────

test("join result is independent of input array order (both rules)", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 110, 2000n), deposit(2n, 100, 1000n)];
  const regs = [registered(1n, 105, 111n), registered(1n, 120, 222n), registered(2n, 105, 333n)];
  for (const rule of [1, 2] as const) {
    const a = joinDepositsAndRegistrations(deposits, regs, rule);
    const b = joinDepositsAndRegistrations([...deposits].reverse(), [...regs].reverse(), rule);
    assert.deepEqual(a, b);
  }
});
