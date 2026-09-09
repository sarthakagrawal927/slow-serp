# slow-serp

A small, self-hosted scraping service and scheduled crawler. It drives the machine's installed **Google Chrome**, keeps an optional persistent browser profile, and supports headful or unattended headless operation.

It has three entry points:

- `npm start` exposes the paced Google search API.
- `npm run jobs` collects normalized public job listings into dated JSON and CSV.
- `npm run crawl` runs the general target registry, capturing ordinary pages or invoking the jobs extractor as configured.

This is intentionally not a CAPTCHA solver or an aggressive crawler. If Google returns a consent, unusual-traffic, or challenge page, the API stops with an `upstream_blocked` error so the profile or egress can be checked by a human.

## Design

- Real installed Chrome, not Playwright's bundled Chromium.
- Configurable headful/headless persistent context.
- One paced queue per Google-search instance.
- Bounded browser concurrency with one active page per hostname.
- Optional blocking of images, fonts, and media for lower background resource use.
- Proxy credentials supplied only at runtime.
- API-key authentication when the HTTP service is exposed beyond localhost.
- No automatic CAPTCHA interaction.

## Requirements

- Node.js 22 or newer.
- Google Chrome installed.
- A display only when `SCRAPER_HEADLESS=false`. Headless scheduled crawls do not require one.

## Install and verify

```bash
git clone https://github.com/sarthakagrawal927/slow-serp.git
cd slow-serp
npm ci
npm test
npm run doctor
```

Run the general registry or the dedicated jobs collector:

```bash
SCRAPER_HEADLESS=true SCRAPER_BLOCK_RESOURCES=true npm run crawl
SCRAPER_HEADLESS=true SCRAPER_BLOCK_RESOURCES=true npm run jobs
```

## General targets

The general crawler reads `targets/default.json`. A target can capture an ordinary page:

```json
{
  "name": "Example page",
  "url": "https://example.com/",
  "extractor": "page"
}
```

Or it can invoke the jobs adapter with URL allow-patterns:

```json
{
  "name": "Example careers",
  "company": "Example",
  "url": "https://example.com/careers",
  "extractor": "jobs",
  "jobUrlIncludes": ["example.com/careers/"]
}
```

Each crawl writes `data/crawls/latest.json` plus a timestamped run. A failed target is recorded without discarding successful targets. Override the registry or output directory with `SCRAPER_TARGETS_FILE` and `SCRAPER_OUTPUT_DIR`.

## Background operation on macOS

The bundled LaunchAgent runs `npm run crawl` immediately and every six hours. It uses headless Chrome, three concurrent target pages, resource blocking, `caffeinate` during each run, and local log files. No credentials are embedded in the agent.

The scheduled crawler uses its own Chrome profile so it cannot collide with an independently running API service.

```bash
npm run macos:validate
npm run macos:install
npm run macos:status
```

Results appear under `data/crawls/`; logs appear under `logs/`. Keep the Mac powered and connected to the network. To stop and remove the background job:

```bash
npm run macos:uninstall
```

## Google search API

Run a direct smoke test or start the local service:

```bash
npm run smoke -- "best mechanical keyboards"
SCRAPER_API_KEY='replace-with-a-strong-random-value' npm start
```

The service binds to `127.0.0.1:8787` by default. Keep that default and put an authenticated TLS reverse proxy in front of it, or deliberately set a private-network bind address.

- `GET /health` reports readiness, queue depth, pacing, and whether a proxy is configured; it never returns proxy credentials.
- `POST /v1/search` accepts `q`, `num` (1–10), `start` (0–90), `hl`, and `gl`.

Example request:

```bash
curl -sS http://127.0.0.1:8787/v1/search \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $SCRAPER_API_KEY" \
  --data '{"q":"playwright persistent context","num":5,"hl":"en","gl":"us"}'
```

## Runtime configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHROME_EXECUTABLE` | auto-detected | Absolute Google Chrome executable path |
| `SCRAPER_HOST` | `127.0.0.1` | HTTP bind address |
| `SCRAPER_PORT` | `8787` | HTTP port |
| `SCRAPER_API_KEY` | unset | Bearer token; required when exposed |
| `SCRAPER_PROFILE_DIR` | `work/chrome-profile` | Persistent Chrome profile directory |
| `SCRAPER_HEADLESS` | `false` | Run Chrome without visible windows |
| `SCRAPER_BLOCK_RESOURCES` | `false` | Skip images, fonts, and media |
| `SCRAPER_BROWSER_CONCURRENCY` | `3` | Concurrent targets, capped at 8 |
| `SCRAPER_TARGETS_FILE` | `targets/default.json` | General crawler registry |
| `SCRAPER_OUTPUT_DIR` | `data/crawls` | General crawler output directory |
| `SCRAPER_PROXY_SERVER` | unset | Proxy endpoint, such as `http://host:port` |
| `SCRAPER_PROXY_USERNAME` | unset | Proxy username |
| `SCRAPER_PROXY_PASSWORD` | unset | Proxy password |
| `SCRAPER_MIN_DELAY_MS` | `30000` | Minimum delay between Google searches |
| `SCRAPER_JITTER_MS` | `5000` | Additional randomized Google-search delay |
| `SCRAPER_NAVIGATION_TIMEOUT_MS` | `45000` | Navigation timeout |
| `SCRAPER_MAX_QUEUE_SIZE` | `100` | Maximum queued Google searches |
| `SCRAPER_LOCALE` | `en-US` | Chrome locale |
| `SCRAPER_TIMEZONE` | `UTC` | Chrome timezone |

On a Linux host, set `SCRAPER_HEADLESS=true`. If visible Chrome is required, run under `xvfb-run` while keeping headless mode disabled.

Keep secret values in the machine's process manager or secret store. They are never needed in a checked-in file.
