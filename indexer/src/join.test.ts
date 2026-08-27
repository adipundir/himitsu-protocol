import { test } from "node:test";
import assert from "node:assert/strict";
import { joinDepositsAndRegistrations } from "./join.ts";
import type { DepositEvent, RegisteredEvent } from "./types.ts";

const TOKEN = 0xabcn;

function deposit(addr: bigint, block: number, amount: bigint): DepositEvent {
  return { txHash: `0xd${block}`, blockNumber: block, userAddress: addr, token: TOKEN, amount };
}
function registered(addr: bigint, block: number, commitment: bigint): RegisteredEvent {
  return { txHash: `0xr${block}`, blockNumber: block, caller: addr, commitment };
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
