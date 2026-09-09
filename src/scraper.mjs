import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { PacedQueue } from "./paced-queue.mjs";
import { buildSearchUrl, detectBlock, extractOrganicResults } from "./google.mjs";
import { extractJobsFromPage } from "./jobs.mjs";

export class BlockedError extends Error {
  constructor(reason, url) {
    super(`Google returned a block or challenge page: ${reason}`);
    this.name = "BlockedError";
    this.reason = reason;
    this.url = url;
  }
}

export class Scraper {
  #context;
  #starting;

  constructor(config) {
    this.config = config;
    this.queue = new PacedQueue(config);
  }

  async start() {
    if (this.#context) return this.#context;
    if (this.#starting) return this.#starting;
    this.#starting = this.#launch();
    try {
      this.#context = await this.#starting;
      return this.#context;
    } finally {
      this.#starting = null;
    }
  }

  async #launch() {
    await mkdir(this.config.profileDir, { recursive: true });
    return chromium.launchPersistentContext(this.config.profileDir, {
      executablePath: this.config.chromeExecutable,
      headless: false,
      locale: this.config.locale,
      timezoneId: this.config.timezoneId,
      proxy: this.config.proxy,
      viewport: { width: 1365, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled", "--no-first-run"],
    });
  }

  async search(request) {
    return this.queue.schedule(async () => {
      const context = await this.start();
      const page = await context.newPage();
      const startedAt = Date.now();
      const url = buildSearchUrl(request.q, request);

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: this.config.navigationTimeoutMs,
        });
        await page.waitForTimeout(1_000);

        const snapshot = {
          url: page.url(),
          title: await page.title(),
          bodyText: (await page.locator("body").innerText({ timeout: 5_000 })).slice(0, 20_000),
          status: response?.status() ?? 0,
        };
        const block = detectBlock(snapshot);
        if (block.blocked) throw new BlockedError(block.reason, snapshot.url);

        const results = await extractOrganicResults(page, request.num);
        return {
          query: request.q,
          results,
          resultCount: results.length,
          sourceUrl: snapshot.url,
          fetchedAt: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt,
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    });
  }

  async scrapeJobs(target) {
    const context = await this.start();
    const page = await context.newPage();
    const startedAt = Date.now();

    try {
      const response = await page.goto(target.careersUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeoutMs,
      });
      await page.waitForTimeout(1_500);
      const jobs = await extractJobsFromPage(page, target);
      return {
        company: target.company,
        careersUrl: target.careersUrl,
        status: response?.status() ?? 0,
        jobs,
        jobCount: jobs.length,
        fetchedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close() {
    await this.#context?.close();
    this.#context = undefined;
  }

  status() {
    return {
      browserReady: Boolean(this.#context),
      queueDepth: this.queue.pending,
      lastRequestStartedAt: this.queue.lastStartedAt
        ? new Date(this.queue.lastStartedAt).toISOString()
        : null,
      proxyConfigured: Boolean(this.config.proxy),
      minDelayMs: this.config.minDelayMs,
    };
  }
}
