import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { mapConcurrentByKey } from "../src/concurrency.mjs";
import { loadConfig } from "../src/config.mjs";
import { validatePageTarget } from "../src/page.mjs";
import { TargetRunner } from "../src/runner.mjs";

const config = loadConfig();
const targetsPath = resolve(process.env.SCRAPER_TARGETS_FILE || process.argv[2] || "targets/default.json");
const outputDir = resolve(process.env.SCRAPER_OUTPUT_DIR || "data/crawls");
const targets = JSON.parse(await readFile(targetsPath, "utf8")).map(validatePageTarget);
const runner = await new TargetRunner(config).start();
const gzipAsync = promisify(gzip);
const crawlStartedAt = Date.now();

try {
  const results = await mapConcurrentByKey(
    targets,
    config.httpConcurrency,
    (target) => new URL(target.url).hostname,
    async (target) => {
      try {
        const result = await runner.run(target);
        console.log(`${target.name}: ${result.transport}, HTTP ${result.status}, ${result.jobCount ?? "page captured"}`);
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
    httpCount: results.filter((result) => result.transport === "http").length,
    browserCount: results.filter((result) => result.transport === "browser").length,
    cacheReuseCount: results.filter((result) => ["not_modified", "content_unchanged"].includes(result.cacheStatus)).length,
    elapsedMs: Date.now() - crawlStartedAt,
    results,
  };
  const runName = generatedAt.replaceAll(":", "-").replace(".", "-");
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const compressed = await gzipAsync(serialized, { level: 6 });
  await mkdir(resolve(outputDir, "runs"), { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, "latest.json"), serialized),
    writeFile(resolve(outputDir, "runs", `${runName}.json.gz`), compressed),
  ]);
  console.log(`Saved crawl: ${report.successCount}/${report.targetCount} targets, ${report.itemCount} items`);
  if (report.failureCount) process.exitCode = 2;
} finally {
  await runner.close();
}
