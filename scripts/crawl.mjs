import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mapConcurrentByKey } from "../src/concurrency.mjs";
import { loadConfig } from "../src/config.mjs";
import { validatePageTarget } from "../src/page.mjs";
import { Scraper } from "../src/scraper.mjs";

const config = loadConfig();
const targetsPath = resolve(process.env.SCRAPER_TARGETS_FILE || process.argv[2] || "targets/default.json");
const outputDir = resolve(process.env.SCRAPER_OUTPUT_DIR || "data/crawls");
const targets = JSON.parse(await readFile(targetsPath, "utf8")).map(validatePageTarget);
const scraper = new Scraper(config);

try {
  const results = await mapConcurrentByKey(
    targets,
    config.browserConcurrency,
    (target) => new URL(target.url).hostname,
    async (target) => {
      try {
        const result = target.extractor === "jobs"
          ? await scraper.scrapeJobs(target)
          : await scraper.scrapePage(target);
        console.log(`${target.name}: HTTP ${result.status}, ${result.jobCount ?? "page captured"}`);
        return { ok: true, extractor: target.extractor, ...result };
      } catch (error) {
        console.error(`${target.name}: ${error.message}`);
        return {
          ok: false,
          name: target.name,
          sourceUrl: target.url,
          extractor: target.extractor,
          error: error.message,
          failedAt: new Date().toISOString(),
        };
      }
    },
  );

  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    targetsFile: targetsPath,
    targetCount: targets.length,
    successCount: results.filter((result) => result.ok).length,
    failureCount: results.filter((result) => !result.ok).length,
    itemCount: results.reduce((count, result) => count + (result.jobCount ?? (result.ok ? 1 : 0)), 0),
    results,
  };
  const runName = generatedAt.replaceAll(":", "-").replace(".", "-");
  await mkdir(resolve(outputDir, "runs"), { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(resolve(outputDir, "runs", `${runName}.json`), `${JSON.stringify(report, null, 2)}\n`),
  ]);
  console.log(`Saved crawl: ${report.successCount}/${report.targetCount} targets, ${report.itemCount} items`);
  if (report.failureCount) process.exitCode = 2;
} finally {
  await scraper.close();
}
