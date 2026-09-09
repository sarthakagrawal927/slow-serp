import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mapConcurrentByKey } from "../src/concurrency.mjs";
import { loadConfig } from "../src/config.mjs";
import { validatePageTarget } from "../src/page.mjs";
import { TargetRunner } from "../src/runner.mjs";

const config = loadConfig();
const targetsPath = resolve(process.env.SCRAPER_TARGETS_FILE || "targets/default.json");
const targets = JSON.parse(await readFile(targetsPath, "utf8"))
  .map(validatePageTarget)
  .filter((target) => target.extractor === "jobs");
const outputDir = resolve("data");
const date = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const runner = await new TargetRunner({ ...config, minDelayMs: 1_000, jitterMs: 0 }).start();

function csvCell(value) {
  const cell = String(value ?? "");
  return /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

try {
  const sources = await mapConcurrentByKey(
    targets,
    config.httpConcurrency,
    (target) => new URL(target.url).hostname,
    async (target) => {
      const result = await runner.run(target);
      console.log(`${result.company}: ${result.jobCount} jobs via ${result.transport} (HTTP ${result.status})`);
      return result;
    },
  );

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
  await runner.close();
}
