import { test } from "node:test";
import assert from "node:assert/strict";
import { getSelectorFromName } from "./selector.ts";

const KNOWN_DEPOSIT_SELECTOR = 0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2n;

test("getSelectorFromName reproduces the pool's verified Deposit selector", () => {
  assert.equal(getSelectorFromName("Deposit"), KNOWN_DEPOSIT_SELECTOR);
});
