import { loadConfig } from "../src/config.mjs";
import { validateSearchRequest } from "../src/google.mjs";
import { BlockedError, Scraper } from "../src/scraper.mjs";

const query = process.argv.slice(2).join(" ").trim() || "site:example.com example domain";
const scraper = new Scraper({ ...loadConfig(), minDelayMs: 1_000, jitterMs: 0 });

try {
  const result = await scraper.search(validateSearchRequest({ q: query, num: 5 }));
  console.log(JSON.stringify(result, null, 2));
  if (result.results.length === 0) process.exitCode = 2;
} catch (error) {
  if (error instanceof BlockedError) {
    console.error(JSON.stringify({
      ok: false,
      error: "upstream_blocked",
      reason: error.reason,
      url: error.url,
    }, null, 2));
    process.exitCode = 2;
  } else {
    throw error;
  }
} finally {
  await scraper.close();
}
