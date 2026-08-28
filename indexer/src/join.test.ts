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

test("matches a registration to the nearest preceding deposit from the same address", () => {
  const deposits = [deposit(1n, 100, 1000n)];
  const regs = [registered(1n, 105, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs);
  assert.equal(joined.length, 1);
  assert.equal(joined[0]!.depositBlock, 100);
  assert.equal(joined[0]!.amount, 1000n);
});

test("a registration cannot consume a deposit that happens after it", () => {
  const deposits = [deposit(1n, 200, 1000n)]; // deposit AFTER the registration
  const regs = [registered(1n, 100, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs);
  assert.equal(joined.length, 0);
});

test("each deposit is consumed by at most one registration ('nearest unconsumed')", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 110, 2000n)];
  const regs = [registered(1n, 105, 111n), registered(1n, 120, 222n)];
  const joined = joinDepositsAndRegistrations(deposits, regs);
  assert.equal(joined.length, 2);
  // reg@105 can only see deposit@100 (deposit@110 is after it) -> takes deposit@100
  const first = joined.find((j) => j.commitment === 111n)!;
  assert.equal(first.depositBlock, 100);
  // reg@120 sees both deposits, but deposit@100 is already consumed -> takes deposit@110
  const second = joined.find((j) => j.commitment === 222n)!;
  assert.equal(second.depositBlock, 110);
});

test("registrations from a different address never match", () => {
  const deposits = [deposit(1n, 100, 1000n)];
  const regs = [registered(2n, 105, 999n)];
  const joined = joinDepositsAndRegistrations(deposits, regs);
  assert.equal(joined.length, 0);
});

// ─── dedupeByCommitment (commitment-collision griefing defense) ─────────────

test("dedupe: earliest registration of a commitment wins; later copies are dropped", () => {
  // Victim registers C at block 105 against their own deposit; attacker re-registers the
  // now-public C at block 120 against the attacker's own deposit.
  const deposits = [deposit(1n, 100, 1000n), deposit(2n, 110, 1000n)];
  const regs = [registered(1n, 105, 777n), registered(2n, 120, 777n)];
  const { kept, dropped } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs));
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
  const fwd = dedupeByCommitment(joinDepositsAndRegistrations(deposits, [regA, regB]));
  const rev = dedupeByCommitment(joinDepositsAndRegistrations(deposits, [regB, regA]));
  assert.equal(fwd.kept[0]!.registerTxHash, "0xa"); // lower txHash wins the tie
  assert.equal(rev.kept[0]!.registerTxHash, "0xa"); // regardless of input order
});

test("dedupe: distinct commitments are untouched", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(2n, 110, 1000n)];
  const regs = [registered(1n, 105, 111n), registered(2n, 120, 222n)];
  const { kept, dropped } = dedupeByCommitment(joinDepositsAndRegistrations(deposits, regs));
  assert.equal(kept.length, 2);
  assert.equal(dropped.length, 0);
});

// ─── determinism: the join is a pure function of the event SET ──────────────

test("join result is independent of input array order", () => {
  const deposits = [deposit(1n, 100, 1000n), deposit(1n, 110, 2000n), deposit(2n, 100, 1000n)];
  const regs = [registered(1n, 105, 111n), registered(1n, 120, 222n), registered(2n, 105, 333n)];
  const a = joinDepositsAndRegistrations(deposits, regs);
  const b = joinDepositsAndRegistrations([...deposits].reverse(), [...regs].reverse());
  assert.deepEqual(a, b);
});
