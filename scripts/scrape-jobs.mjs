import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { Scraper } from "../src/scraper.mjs";

const TARGETS = [
  {
    company: "Linear",
    careersUrl: "https://linear.app/careers",
    jobUrlIncludes: ["linear.app/careers/"],
  },
  {
    company: "Supabase",
    careersUrl: "https://supabase.com/careers",
    jobUrlIncludes: ["jobs.ashbyhq.com/supabase/"],
  },
  {
    company: "Vercel",
    careersUrl: "https://vercel.com/careers",
    jobUrlIncludes: ["vercel.com/careers/"],
  },
];

const outputDir = resolve("data");
const date = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const scraper = new Scraper({ ...loadConfig(), minDelayMs: 1_000, jitterMs: 0 });

function csvCell(value) {
  const cell = String(value ?? "");
  return /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

try {
  const sources = [];
  for (const target of TARGETS) {
    const result = await scraper.scrapeJobs(target);
    sources.push(result);
    console.log(`${result.company}: ${result.jobCount} jobs (HTTP ${result.status})`);
  }

  const jobs = sources.flatMap((source) => source.jobs);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceCount: sources.length,
    jobCount: jobs.length,
    sources: sources.map(({ jobs: _jobs, ...source }) => source),
    jobs,
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, `yc-jobs-${date}.json`);
  const csvPath = resolve(outputDir, `yc-jobs-${date}.csv`);
  const csv = [
    ["company", "title", "url", "source_url", "context"],
    ...jobs.map((job) => [job.company, job.title, job.url, job.sourceUrl, job.context]),
  ].map((row) => row.map(csvCell).join(",")).join("\n");

  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(csvPath, `${csv}\n`),
  ]);
  console.log(`Saved ${jobs.length} jobs to ${jsonPath} and ${csvPath}`);
  if (jobs.length === 0) process.exitCode = 2;
} finally {
  await scraper.close();
}
