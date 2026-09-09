import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createScraperServer } from "../src/server.mjs";

const quietLogger = { info() {}, error() {} };

async function withServer(options, run) {
  const server = createScraperServer({ ...options, logger: quietLogger });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health does not disclose proxy credentials", async () => {
  const scraper = {
    status: () => ({ browserReady: false, proxyConfigured: true, queueDepth: 0 }),
  };
  await withServer({ scraper, config: { apiKey: "secret" } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      browserReady: false,
      proxyConfigured: true,
      queueDepth: 0,
    });
  });
});

test("search requires the configured API key", async () => {
  const scraper = { status: () => ({}), search: async () => ({}) };
  await withServer({ scraper, config: { apiKey: "correct" } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/search`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ q: "hello" }),
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "unauthorized");
  });
});

test("search validates input and returns scraper results", async () => {
  const calls = [];
  const scraper = {
    status: () => ({}),
    search: async (input) => {
      calls.push(input);
      return { query: input.q, resultCount: 1, results: [{ title: "Example" }] };
    },
  };
  await withServer({ scraper, config: { apiKey: null } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: " example ", num: 1 }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.query, "example");
    assert.equal(body.resultCount, 1);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(calls, [{ q: "example", num: 1, start: 0, hl: "en", gl: "us" }]);
  });
});
