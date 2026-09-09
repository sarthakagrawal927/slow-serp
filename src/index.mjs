import { loadConfig } from "./config.mjs";
import { Scraper } from "./scraper.mjs";
import { createScraperServer } from "./server.mjs";

const config = loadConfig();
const scraper = new Scraper(config);
const server = createScraperServer({ scraper, config });

server.listen(config.port, config.host, () => {
  console.info(`slow-serp listening on http://${config.host}:${config.port}`);
  console.info(`Chrome profile: ${config.profileDir}`);
  console.info(`Proxy configured: ${Boolean(config.proxy)}`);
});

async function shutdown(signal) {
  console.info(`${signal} received; shutting down`);
  server.close();
  await scraper.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
