import { setTimeout as sleep } from "node:timers/promises";

export class QueueFullError extends Error {
  constructor(limit) {
    super(`Search queue is full (limit: ${limit})`);
    this.name = "QueueFullError";
  }
}

export class PacedQueue {
  #tail = Promise.resolve();
  #pending = 0;
  #lastStartedAt = 0;

  constructor({ minDelayMs, jitterMs = 0, maxQueueSize = 100, now = Date.now, random = Math.random }) {
    this.minDelayMs = minDelayMs;
    this.jitterMs = jitterMs;
    this.maxQueueSize = maxQueueSize;
    this.now = now;
    this.random = random;
  }

  get pending() {
    return this.#pending;
  }

  get lastStartedAt() {
    return this.#lastStartedAt || null;
  }

  schedule(task) {
    if (this.#pending >= this.maxQueueSize) throw new QueueFullError(this.maxQueueSize);
    this.#pending += 1;

    const run = async () => {
      const jitter = Math.floor(this.random() * (this.jitterMs + 1));
      const earliestStart = this.#lastStartedAt + this.minDelayMs + jitter;
      const waitMs = Math.max(0, earliestStart - this.now());
      if (waitMs > 0) await sleep(waitMs);
      this.#lastStartedAt = this.now();
      return task();
    };

    const result = this.#tail.then(run);
    this.#tail = result.catch(() => undefined).finally(() => {
      this.#pending -= 1;
    });
    return result;
  }
}
