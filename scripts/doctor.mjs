import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { validatePageTarget } from "../src/page.mjs";

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

const major = Number(process.versions.node.split(".")[0]);
record("Node.js", major >= 22, process.version);

try {
  const config = loadConfig();
  await access(config.chromeExecutable, constants.X_OK);
  record("Google Chrome", true, config.chromeExecutable);
  record("Chrome mode", true, config.headless ? "headless" : "headful");
  record("Worker limits", true, `${config.httpConcurrency} HTTP / ${config.browserConcurrency} browser`);
  record("HTTP safeguards", true, `${config.httpTimeoutMs}ms timeout, ${config.httpRetries} retries, ${config.maxResponseBytes} byte cap`);
} catch (error) {
  record("Google Chrome", false, error.message);
}

try {
  const targetsPath = resolve(process.env.SCRAPER_TARGETS_FILE || "targets/default.json");
  const targets = JSON.parse(await readFile(targetsPath, "utf8")).map(validatePageTarget);
  record("Target registry", targets.length > 0, `${targets.length} targets in ${targetsPath}`);
} catch (error) {
  record("Target registry", false, error.message);
}

if (process.platform === "darwin") {
  try {
    await access("/bin/launchctl", constants.X_OK);
    record("macOS background runner", true, "launchctl available");
  } catch (error) {
    record("macOS background runner", false, error.message);
  }
} else {
  record("Platform", true, `${process.platform}; use a systemd timer or cron instead of launchd`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
