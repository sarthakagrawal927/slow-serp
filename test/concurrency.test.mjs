import test from "node:test";
import assert from "node:assert/strict";
import { mapConcurrent, mapConcurrentByKey } from "../src/concurrency.mjs";

test("mapConcurrent preserves order and respects the limit", async () => {
  let active = 0;
  let peak = 0;
  const values = await mapConcurrent([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(values, [2, 4, 6, 8]);
  assert.equal(peak, 2);
});

test("mapConcurrentByKey never overlaps work for the same key", async () => {
  const activeKeys = new Set();
  let peak = 0;
  const values = await mapConcurrentByKey(
    [{ key: "a", value: 1 }, { key: "a", value: 2 }, { key: "b", value: 3 }],
    3,
    (item) => item.key,
    async (item) => {
      assert.equal(activeKeys.has(item.key), false);
      activeKeys.add(item.key);
      peak = Math.max(peak, activeKeys.size);
      await new Promise((resolve) => setTimeout(resolve, 3));
      activeKeys.delete(item.key);
      return item.value;
    },
  );
  assert.deepEqual(values, [1, 2, 3]);
  assert.equal(peak, 2);
});
