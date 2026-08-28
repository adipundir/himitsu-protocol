import { test } from "node:test";
import assert from "node:assert/strict";
import { heatStopForDepth } from "./heat.ts";

test("heat stop boundaries match gaugeMultiplierX10's tiers for stops 1-3, then split the 1.2x tail", () => {
  assert.equal(heatStopForDepth(0), 1);
  assert.equal(heatStopForDepth(24), 1);
  assert.equal(heatStopForDepth(25), 2);
  assert.equal(heatStopForDepth(99), 2);
  assert.equal(heatStopForDepth(100), 3);
  assert.equal(heatStopForDepth(399), 3);
  assert.equal(heatStopForDepth(400), 4);
  assert.equal(heatStopForDepth(999), 4);
  assert.equal(heatStopForDepth(1000), 5);
  assert.equal(heatStopForDepth(50_000), 5);
});
