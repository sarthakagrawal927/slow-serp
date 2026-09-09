export class ConcurrencyGate {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError("Concurrency limit must be a positive integer");
    this.limit = limit;
    this.active = 0;
    this.waiting = [];
  }

  async run(task) {
    if (this.active >= this.limit) await new Promise((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
