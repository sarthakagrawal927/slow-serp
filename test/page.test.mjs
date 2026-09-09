import test from "node:test";
import assert from "node:assert/strict";
import { validatePageTarget } from "../src/page.mjs";

test("validatePageTarget normalizes a generic page target", () => {
  assert.deepEqual(validatePageTarget({ name: " Example ", url: "https://example.com", extractor: "page" }), {
    name: "Example",
    url: "https://example.com/",
    extractor: "page",
  });
});

test("validatePageTarget prepares a jobs target", () => {
  assert.deepEqual(validatePageTarget({
    name: "Careers",
    company: "Example Inc",
    url: "https://example.com/jobs",
    extractor: "jobs",
    jobUrlIncludes: [" example.com/jobs/ "],
  }), {
    name: "Careers",
    company: "Example Inc",
    url: "https://example.com/jobs",
    careersUrl: "https://example.com/jobs",
    extractor: "jobs",
    jobUrlIncludes: ["example.com/jobs/"],
  });
});

test("validatePageTarget rejects unsafe schemes and incomplete job targets", () => {
  assert.throws(() => validatePageTarget({ name: "File", url: "file:///etc/passwd" }), /HTTP or HTTPS/);
  assert.throws(() => validatePageTarget({ name: "Jobs", url: "https://example.com", extractor: "jobs" }), /jobUrlIncludes/);
});
