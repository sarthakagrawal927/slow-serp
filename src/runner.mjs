import { ConcurrencyGate } from "./gate.mjs";
import { HttpCache } from "./http-cache.mjs";
import { BrowserFallbackError, HttpScraper } from "./http.mjs";
import { Scraper } from "./scraper.mjs";

export class TargetRunner {
  constructor(config) {
    this.config = config;
    this.browser = new Scraper(config);
    this.browserGate = new ConcurrencyGate(config.browserConcurrency);
    this.cache = new HttpCache(config.httpCacheFile);
    this.http = new HttpScraper(config, this.cache);
  }

  async start() {
    await this.cache.load();
    return this;
  }

  async run(target) {
    const startedAt = Date.now();
    let fallbackReason = null;
    if (target.transport !== "browser") {
      try {
        return await this.http.scrape(target);
      } catch (error) {
        if (target.transport === "http" || !(error instanceof BrowserFallbackError)) throw error;
        fallbackReason = error.message;
      }
    }

    const result = await this.browserGate.run(() => target.extractor === "jobs"
      ? this.browser.scrapeJobs(target)
      : this.browser.scrapePage(target));
    return {
      ...result,
      transport: "browser",
      cacheStatus: "bypassed",
      browserElapsedMs: result.elapsedMs,
      elapsedMs: Date.now() - startedAt,
      ...(fallbackReason ? { fallbackReason } : {}),
    };
  }

  async close() {
    await Promise.all([this.cache.save(), this.browser.close()]);
  }
}
