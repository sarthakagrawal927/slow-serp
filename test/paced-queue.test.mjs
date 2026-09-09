import test from "node:test";
import assert from "node:assert/strict";
import { PacedQueue, QueueFullError } from "../src/paced-queue.mjs";

test("PacedQueue runs jobs serially", async () => {
  const events = [];
  const queue = new PacedQueue({ minDelayMs: 0, jitterMs: 0 });
  const first = queue.schedule(async () => {
    events.push("first:start");
    await new Promise((resolve) => setImmediate(resolve));
    events.push("first:end");
  });
  const second = queue.schedule(async () => events.push("second"));
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second"]);
});

test("PacedQueue rejects work above its queue limit", async () => {
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const queue = new PacedQueue({ minDelayMs: 0, maxQueueSize: 1 });
  const first = queue.schedule(() => blocker);
  assert.throws(() => queue.schedule(() => undefined), QueueFullError);
  release();
  await first;
});
