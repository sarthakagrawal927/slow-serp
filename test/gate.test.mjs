import test from "node:test";
import assert from "node:assert/strict";
import { ConcurrencyGate } from "../src/gate.mjs";

test("ConcurrencyGate caps active work", async () => {
  const gate = new ConcurrencyGate(2);
  let active = 0;
  let peak = 0;
  await Promise.all([1, 2, 3, 4].map(() => gate.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
  })));
  assert.equal(peak, 2);
});
