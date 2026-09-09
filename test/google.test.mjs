import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, detectBlock, validateSearchRequest } from "../src/google.mjs";

test("buildSearchUrl encodes query and locale controls", () => {
  const url = new URL(buildSearchUrl("scraping bee", { hl: "es", gl: "es", num: 7, start: 10 }));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("q"), "scraping bee");
  assert.equal(url.searchParams.get("hl"), "es");
  assert.equal(url.searchParams.get("gl"), "es");
  assert.equal(url.searchParams.get("num"), "7");
  assert.equal(url.searchParams.get("start"), "10");
});

test("detectBlock identifies status, sorry, challenge, and consent pages", () => {
  assert.equal(detectBlock({ status: 429 }).reason, "http_429");
  assert.equal(detectBlock({ url: "https://google.com/sorry/index" }).reason, "google_sorry_page");
  assert.equal(detectBlock({ bodyText: "Our systems have detected unusual traffic" }).reason, "challenge_page");
  assert.equal(detectBlock({ title: "Before you continue to Google" }).reason, "consent_required");
  assert.deepEqual(detectBlock({ bodyText: "ordinary search results" }), { blocked: false, reason: null });
});

test("validateSearchRequest normalizes a supported request", () => {
  assert.deepEqual(validateSearchRequest({ q: "  hello  ", num: 5, start: 20, hl: "en", gl: "GB" }), {
    q: "hello",
    num: 5,
    start: 20,
    hl: "en",
    gl: "gb",
  });
});

test("validateSearchRequest rejects oversized and unsafe pagination", () => {
  assert.throws(() => validateSearchRequest({ q: "" }), /q must/);
  assert.throws(() => validateSearchRequest({ q: "ok", num: 100 }), /num must/);
  assert.throws(() => validateSearchRequest({ q: "ok", start: -1 }), /start must/);
});
