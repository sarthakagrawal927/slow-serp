import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/opt/google/chrome/google-chrome",
];

function integer(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} must be a boolean (true/false, 1/0, yes/no, or on/off)`);
}

function findChrome() {
  if (process.env.CHROME_EXECUTABLE) return resolve(process.env.CHROME_EXECUTABLE);
  return DEFAULT_CHROME_PATHS.find(existsSync) ?? null;
}

function proxyConfig() {
  const server = process.env.SCRAPER_PROXY_SERVER?.trim();
  if (!server) return undefined;
  return {
    server,
    ...(process.env.SCRAPER_PROXY_USERNAME
      ? { username: process.env.SCRAPER_PROXY_USERNAME }
      : {}),
    ...(process.env.SCRAPER_PROXY_PASSWORD
      ? { password: process.env.SCRAPER_PROXY_PASSWORD }
      : {}),
  };
}

export function loadConfig() {
  const chromeExecutable = findChrome();
  if (!chromeExecutable) {
    throw new Error(
      "Google Chrome was not found. Set CHROME_EXECUTABLE to its absolute path.",
    );
  }

  return {
    host: process.env.SCRAPER_HOST?.trim() || "127.0.0.1",
    port: integer("SCRAPER_PORT", 8787, { min: 1, max: 65535 }),
    apiKey: process.env.SCRAPER_API_KEY || null,
    chromeExecutable,
    profileDir: resolve(process.env.SCRAPER_PROFILE_DIR || "work/chrome-profile"),
    locale: process.env.SCRAPER_LOCALE?.trim() || "en-US",
    timezoneId: process.env.SCRAPER_TIMEZONE?.trim() || "UTC",
    proxy: proxyConfig(),
    headless: boolean("SCRAPER_HEADLESS", false),
    blockResources: boolean("SCRAPER_BLOCK_RESOURCES", false),
    browserConcurrency: integer("SCRAPER_BROWSER_CONCURRENCY", 3, {
      min: 1,
      max: 8,
    }),
    httpConcurrency: integer("SCRAPER_HTTP_CONCURRENCY", 12, {
      min: 1,
      max: 64,
    }),
    httpTimeoutMs: integer("SCRAPER_HTTP_TIMEOUT_MS", 15_000, {
      min: 1_000,
      max: 300_000,
    }),
    httpRetries: integer("SCRAPER_HTTP_RETRIES", 2, { min: 0, max: 5 }),
    httpRetryBaseMs: integer("SCRAPER_HTTP_RETRY_BASE_MS", 500, {
      min: 50,
      max: 30_000,
    }),
    maxResponseBytes: integer("SCRAPER_MAX_RESPONSE_BYTES", 5_000_000, {
      min: 100_000,
      max: 100_000_000,
    }),
    httpCacheFile: resolve(process.env.SCRAPER_HTTP_CACHE_FILE || "work/http-cache.json"),
    userAgent: process.env.SCRAPER_USER_AGENT?.trim()
      || "slow-serp/0.2 (+https://github.com/sarthakagrawal927/slow-serp)",
    minDelayMs: integer("SCRAPER_MIN_DELAY_MS", 30_000, {
      min: 1_000,
      max: 3_600_000,
    }),
    jitterMs: integer("SCRAPER_JITTER_MS", 5_000, {
      min: 0,
      max: 300_000,
    }),
    navigationTimeoutMs: integer("SCRAPER_NAVIGATION_TIMEOUT_MS", 45_000, {
      min: 5_000,
      max: 300_000,
    }),
    maxQueueSize: integer("SCRAPER_MAX_QUEUE_SIZE", 100, { min: 1, max: 10_000 }),
  };
}

export { boolean, findChrome };
