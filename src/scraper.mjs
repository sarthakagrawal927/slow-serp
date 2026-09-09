import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { PacedQueue } from "./paced-queue.mjs";
import { buildSearchUrl, detectBlock, extractOrganicResults } from "./google.mjs";
import { extractJobsFromPage } from "./jobs.mjs";
import { extractPageData } from "./page.mjs";

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
    const context = await chromium.launchPersistentContext(this.config.profileDir, {
      executablePath: this.config.chromeExecutable,
      headless: this.config.headless,
      locale: this.config.locale,
      timezoneId: this.config.timezoneId,
      proxy: this.config.proxy,
      viewport: { width: 1365, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled", "--no-first-run"],
    });
    if (this.config.blockResources) {
      await context.route("**/*", (route) => {
        const type = route.request().resourceType();
        return ["font", "image", "media"].includes(type) ? route.abort() : route.continue();
      });
    }
    return context;
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

  async scrapePage(target) {
    const context = await this.start();
    const page = await context.newPage();
    const startedAt = Date.now();

    try {
      const response = await page.goto(target.url, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeoutMs,
      });
      await page.waitForTimeout(1_000);
      return {
        name: target.name,
        sourceUrl: target.url,
        finalUrl: page.url(),
        status: response?.status() ?? 0,
        fetchedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        data: await extractPageData(page, target),
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
      headless: this.config.headless,
      blockResources: this.config.blockResources,
      minDelayMs: this.config.minDelayMs,
    };
  }
}
