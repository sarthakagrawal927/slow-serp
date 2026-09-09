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

export { findChrome };
