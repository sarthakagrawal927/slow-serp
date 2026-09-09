# slow-serp

A small Google search extraction service for one VPS. It drives the machine's installed **Google Chrome** in headful mode, keeps a persistent browser profile, and serializes searches with a conservative default delay of 30 seconds.

It also includes a direct careers-page collector for public job listings. This path does not depend on Google and currently targets Linear, Supabase, and Vercel. Results are written to dated JSON and CSV files under `data/`.

This is intentionally not a CAPTCHA solver or a high-volume crawler. If Google returns a consent, unusual-traffic, or challenge page, the API stops and returns a visible `upstream_blocked` error so the profile or proxy can be checked by a human.

## Why this shape

- Real installed Chrome, not Playwright's bundled Chromium.
- Headful persistent context so cookies and ordinary browser state survive restarts.
- One queue per instance, with pacing and jitter before every search.
- Proxy credentials supplied only at runtime.
- API-key authentication when exposed beyond localhost.
- No stealth-plugin pile or automatic CAPTCHA interaction.

## Requirements

- Node.js 22 or newer.
- Google Chrome installed on the host.
- A display. On a headless Linux VPS, run Chrome under `xvfb-run` while keeping Playwright's `headless: false` mode.

## Install and run

```bash
npm ci
npm test
npm run smoke -- "best mechanical keyboards"
npm run jobs
npm start
```

`npm run jobs` opens each configured careers page in the same persistent Chrome context and saves normalized job titles, URLs, source URLs, and nearby page context. Edit `TARGETS` in `scripts/scrape-jobs.mjs` to add more companies and URL patterns.

The service binds to `127.0.0.1:8787` by default. Keep that default and put a TLS reverse proxy in front of it, or deliberately set a private-network bind address. Do not expose an unauthenticated instance to the public internet.

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
| `SCRAPER_API_KEY` | unset | Bearer token; required when you expose the service |
| `SCRAPER_PROFILE_DIR` | `work/chrome-profile` | Persistent Chrome profile directory |
| `SCRAPER_PROXY_SERVER` | unset | Proxy endpoint, for example `http://host:port` |
| `SCRAPER_PROXY_USERNAME` | unset | Proxy username |
| `SCRAPER_PROXY_PASSWORD` | unset | Proxy password |
| `SCRAPER_MIN_DELAY_MS` | `30000` | Minimum delay between search starts |
| `SCRAPER_JITTER_MS` | `5000` | Extra random delay |
| `SCRAPER_NAVIGATION_TIMEOUT_MS` | `45000` | Page navigation timeout |
| `SCRAPER_MAX_QUEUE_SIZE` | `100` | Backpressure limit |
| `SCRAPER_LOCALE` | `en-US` | Chrome locale |
| `SCRAPER_TIMEZONE` | `UTC` | Chrome timezone |

Keep secret values in your process manager or host secret store. They are never needed in a checked-in file.

## VPS launch

Install Google Chrome and Xvfb using your distribution's supported packages, then launch the service from its project directory:

```bash
xvfb-run --auto-servernum --server-args='-screen 0 1365x900x24' npm start
```

For a long-running instance, configure your existing process manager to execute that command, set `Restart=on-failure` (or its equivalent), and provide the runtime variables through the manager's secret mechanism. The Chrome profile directory must be writable and should live on persistent storage.

## Endpoints

- `GET /health` — readiness, queue depth, pacing, and proxy-present status. It never returns proxy credentials.
- `POST /v1/search` — accepts `q`, `num` (1–10), `start` (0–90), `hl`, and `gl`.

The parser targets organic links containing an `h3`, deduplicates URLs, and excludes Google-owned links. Google can change its markup; a live smoke check is therefore part of deployment verification.
