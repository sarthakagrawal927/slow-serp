import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpCache } from "../src/http-cache.mjs";
import { HttpScraper } from "../src/http.mjs";

async function fixtureServer() {
  let userAgent = null;
  let flakyRequests = 0;
  const server = createServer((request, response) => {
    userAgent = request.headers["user-agent"];
    if (request.url === "/flaky") {
      flakyRequests += 1;
      if (flakyRequests === 1) {
        response.statusCode = 503;
        response.end("retry");
      } else {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end("<html><title>Recovered</title><body>This page recovered after a temporary upstream failure and contains useful content.</body></html>");
      }
    } else if (request.url === "/api") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, items: [1, 2, 3] }));
    } else if (request.url === "/jobs") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<html><title>Jobs</title><body><article><a href='/jobs/backend'>Backend Engineer — Apply</a></article></body></html>");
    } else {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<html><head><title>Example</title><meta name='description' content='A useful page'></head><body><h1>Hello</h1><p>This is enough useful body text for static extraction without launching a browser.</p><a href='/next'>Next</a></body></html>");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
    getUserAgent: () => userAgent,
    getFlakyRequests: () => flakyRequests,
  };
}

test("HttpScraper extracts static pages and reuses unchanged content", async () => {
  const fixture = await fixtureServer();
  const directory = await mkdtemp(join(tmpdir(), "slow-serp-http-"));
  try {
    const cache = await new HttpCache(join(directory, "cache.json")).load();
    const scraper = new HttpScraper({
      proxy: undefined,
      httpTimeoutMs: 5_000,
      maxResponseBytes: 100_000,
      locale: "en-US",
      userAgent: "slow-serp-test",
    }, cache);
    const target = { name: "Example", url: `${fixture.baseUrl}/`, extractor: "page" };
    const first = await scraper.scrape(target);
    const second = await scraper.scrape(target);
    assert.equal(first.transport, "http");
    assert.equal(first.data.title, "Example");
    assert.equal(first.data.links[0].url, `${fixture.baseUrl}/next`);
    assert.equal(second.cacheStatus, "content_unchanged");
    assert.equal(fixture.getUserAgent(), "slow-serp-test");
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("HttpScraper retries transient HTTP failures before browser fallback", async () => {
  const fixture = await fixtureServer();
  const directory = await mkdtemp(join(tmpdir(), "slow-serp-retry-"));
  try {
    const cache = await new HttpCache(join(directory, "cache.json")).load();
    const scraper = new HttpScraper({
      proxy: undefined,
      httpTimeoutMs: 5_000,
      httpRetries: 1,
      httpRetryBaseMs: 1,
      maxResponseBytes: 100_000,
      locale: "en-US",
      userAgent: "slow-serp-test",
    }, cache);
    const result = await scraper.scrape({ name: "Flaky", url: `${fixture.baseUrl}/flaky`, extractor: "page" });
    assert.equal(result.data.title, "Recovered");
    assert.equal(fixture.getFlakyRequests(), 2);
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("HttpScraper captures JSON API responses without a browser", async () => {
  const fixture = await fixtureServer();
  const directory = await mkdtemp(join(tmpdir(), "slow-serp-json-"));
  try {
    const cache = await new HttpCache(join(directory, "cache.json")).load();
    const scraper = new HttpScraper({
      proxy: undefined,
      httpTimeoutMs: 5_000,
      maxResponseBytes: 100_000,
      locale: "en-US",
      userAgent: "slow-serp-test",
    }, cache);
    const result = await scraper.scrape({
      name: "API",
      url: `${fixture.baseUrl}/api`,
      extractor: "json",
    });
    assert.deepEqual(result.data, { ok: true, items: [1, 2, 3] });
    assert.equal(result.transport, "http");
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("HttpScraper extracts job records from static HTML", async () => {
  const fixture = await fixtureServer();
  const directory = await mkdtemp(join(tmpdir(), "slow-serp-jobs-"));
  try {
    const cache = await new HttpCache(join(directory, "cache.json")).load();
    const scraper = new HttpScraper({
      proxy: undefined,
      httpTimeoutMs: 5_000,
      maxResponseBytes: 100_000,
      locale: "en-US",
      userAgent: "slow-serp-test",
    }, cache);
    const result = await scraper.scrape({
      name: "Jobs",
      company: "Example",
      url: `${fixture.baseUrl}/jobs`,
      careersUrl: `${fixture.baseUrl}/jobs`,
      extractor: "jobs",
      jobUrlIncludes: [`${fixture.baseUrl}/jobs/`],
    });
    assert.equal(result.jobCount, 1);
    assert.equal(result.jobs[0].title, "Backend Engineer");
    assert.equal(result.jobs[0].url, `${fixture.baseUrl}/jobs/backend`);
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});
