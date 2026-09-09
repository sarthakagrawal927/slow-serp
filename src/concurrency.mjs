export async function mapConcurrent(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("Concurrency limit must be a positive integer");
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function mapConcurrentByKey(items, limit, keyFor, worker) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("Concurrency limit must be a positive integer");
  return new Promise((resolve, reject) => {
    const pending = items.map((item, index) => ({ item, index, key: keyFor(item) }));
    const results = new Array(items.length);
    const activeKeys = new Set();
    let active = 0;

    const dispatch = () => {
      while (active < limit) {
        const position = pending.findIndex(({ key }) => !activeKeys.has(key));
        if (position === -1) break;
        const [{ item, index, key }] = pending.splice(position, 1);
        active += 1;
        activeKeys.add(key);
        Promise.resolve(worker(item, index)).then((result) => {
          results[index] = result;
          active -= 1;
          activeKeys.delete(key);
          if (pending.length === 0 && active === 0) resolve(results);
          else dispatch();
        }, reject);
      }
      if (pending.length === 0 && active === 0) resolve(results);
    };

    dispatch();
  });
}
