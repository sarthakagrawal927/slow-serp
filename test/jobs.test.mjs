import test from "node:test";
import assert from "node:assert/strict";
import { extractJobRecords } from "../src/jobs.mjs";

const target = {
  company: "Example",
  careersUrl: "https://example.com/careers",
  jobUrlIncludes: ["example.com/careers/", "jobs.example.test/example/"],
};

test("extractJobRecords keeps matching jobs, derives titles, and removes duplicates", () => {
  const jobs = extractJobRecords([
    {
      href: "/careers/backend-engineer",
      text: "Learn more",
      context: "Backend Engineer\nRemote\nLearn more",
    },
    {
      href: "/careers/backend-engineer",
      text: "Backend Engineer",
      context: "Backend Engineer",
    },
    {
      href: "https://jobs.example.test/example/designer",
      text: "Product Designer Apply for position",
      context: "Product Designer\nEurope\nApply for position",
    },
    { href: "/about", text: "About", context: "About" },
  ], target);

  assert.deepEqual(jobs.map(({ title, url }) => ({ title, url })), [
    { title: "Backend Engineer", url: "https://example.com/careers/backend-engineer" },
    { title: "Product Designer", url: "https://jobs.example.test/example/designer" },
  ]);
});

test("extractJobRecords ignores invalid and non-http links", () => {
  assert.deepEqual(extractJobRecords([
    { href: "mailto:jobs@example.com", text: "Email us", context: "" },
    { href: "::::", text: "Broken", context: "" },
  ], target), []);
});
