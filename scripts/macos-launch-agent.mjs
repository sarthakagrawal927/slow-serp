import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("This installer only supports macOS");

const action = process.argv[2] || "status";
const label = "com.slow-serp.crawler";
const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodePath = process.execPath;
const agentDir = resolve(homedir(), "Library/LaunchAgents");
const logsDir = resolve(repoDir, "logs");
const plistPath = resolve(agentDir, `${label}.plist`);
const domain = `gui/${process.getuid()}`;

function xml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function plist() {
  const values = {
    label,
    repoDir,
    nodePath,
    scriptPath: resolve(repoDir, "scripts/crawl.mjs"),
    targetsPath: resolve(repoDir, "targets/default.json"),
    profilePath: resolve(repoDir, "work/chrome-profile-crawler"),
    stdoutPath: resolve(logsDir, "crawler.log"),
    stderrPath: resolve(logsDir, "crawler-error.log"),
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(values.label)}</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>${xml(values.nodePath)}</string><string>${xml(values.scriptPath)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(values.repoDir)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>SCRAPER_HEADLESS</key><string>true</string>
    <key>SCRAPER_BLOCK_RESOURCES</key><string>true</string>
    <key>SCRAPER_BROWSER_CONCURRENCY</key><string>3</string>
    <key>SCRAPER_TARGETS_FILE</key><string>${xml(values.targetsPath)}</string>
    <key>SCRAPER_PROFILE_DIR</key><string>${xml(values.profilePath)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>21600</integer>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xml(values.stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${xml(values.stderrPath)}</string>
</dict></plist>
`;
}

function launchctl(args, allowFailure = false) {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr.trim() || `launchctl ${args[0]} failed`);
  return result;
}

if (action === "install") {
  await mkdir(agentDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
  await writeFile(plistPath, plist(), { mode: 0o600 });
  await chmod(plistPath, 0o600);
  execFileSync("/usr/bin/plutil", ["-lint", plistPath], { stdio: "inherit" });
  launchctl(["bootout", domain, plistPath], true);
  launchctl(["bootstrap", domain, plistPath]);
  launchctl(["kickstart", "-k", `${domain}/${label}`]);
  console.log(`Installed and started ${label}`);
  console.log(`Logs: ${logsDir}`);
} else if (action === "uninstall") {
  launchctl(["bootout", domain, plistPath], true);
  await unlink(plistPath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  console.log(`Uninstalled ${label}`);
} else if (action === "status") {
  const result = launchctl(["print", `${domain}/${label}`], true);
  if (result.status === 0) console.log(result.stdout);
  else {
    console.log(`${label} is not installed`);
    process.exitCode = 1;
  }
} else if (action === "validate") {
  const result = spawnSync("/usr/bin/plutil", ["-lint", "-"], {
    input: plist(),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Generated plist is invalid");
  console.log(result.stdout.trim());
} else {
  throw new Error("Usage: node scripts/macos-launch-agent.mjs install|status|validate|uninstall");
}
