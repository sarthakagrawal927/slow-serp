import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { load } from "cheerio/slim";
import { extractJobRecords } from "./jobs.mjs";

const CACHE_VERSION = 3;

export class BrowserFallbackError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "BrowserFallbackError";
  }
}

function clean(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function retryDelay(response, attempt, baseMs) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - Date.now();
    if (parsed > 0) return Math.min(parsed, 30_000);
  }
  return baseMs * (2 ** attempt) + Math.floor(Math.random() * 200);
}

async function readLimitedBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (declared && declared > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
  const reader = response.body?.getReader();
  if (!reader) return { html: "", bytes: 0 };
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { html: new TextDecoder().decode(combined), bytes };
}

function pagePayload(html, finalUrl) {
  const $ = load(html);
  const baseUrl = new URL($("base[href]").attr("href") || finalUrl, finalUrl);
  const canonicalValue = $("link[rel='canonical']").attr("href");
  let canonicalUrl = null;
  try {
    canonicalUrl = canonicalValue ? new URL(canonicalValue, baseUrl).href : null;
  } catch {
    canonicalUrl = null;
  }
  const headings = $("h1, h2, h3").toArray().map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: clean($(element).text()),
  })).filter((heading) => heading.text).slice(0, 200);
  const seen = new Set();
  const links = $("a[href]").toArray().flatMap((anchor) => {
    let url;
    try {
      url = new URL($(anchor).attr("href"), baseUrl).href;
    } catch {
      return [];
    }
    if (!/^https?:\/\//.test(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ text: clean($(anchor).text()), url }];
  }).slice(0, 1_000);
  $("script, style, noscript, template, svg").remove();
  return {
    title: clean($("title").first().text()),
    description: clean($("meta[name='description']").attr("content")) || null,
    canonicalUrl,
    headings,
    links,
    text: clean($("body").text()).slice(0, 100_000),
  };
}

function jobsPayload(html, target, finalUrl) {
  const $ = load(html);
  const baseUrl = new URL($("base[href]").attr("href") || finalUrl, finalUrl);
  const structuredText = (element) => {
    const clone = element.clone();
    clone.find("br").replaceWith("\n");
    clone.find("address, article, aside, div, footer, h1, h2, h3, h4, h5, h6, header, li, main, nav, p, section")
      .prepend("\n")
      .append("\n");
    return clone.text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  };
  const anchors = $("a[href]").toArray().flatMap((anchor) => {
    const element = $(anchor);
    const container = element.closest("li, article, [role='listitem']").first();
    try {
      return [{
        href: new URL(element.attr("href"), baseUrl).href,
        text: structuredText(element),
        roleText: clean(element.find("[data-testid*='title'], [class*='title'], h1, h2, h3, h4, h5, h6, p").first().text()),
        headingText: clean(element.find("h1, h2, h3, h4, h5, h6").first().text()),
        primaryText: clean(element.children().first().text()),
        ariaLabel: element.attr("aria-label") || "",
        title: element.attr("title") || "",
        context: structuredText(container.length ? container : element.parent()),
      }];
    } catch {
      return [];
    }
  });
  return extractJobRecords(anchors, target);
}

export class HttpScraper {
  constructor(config, cache) {
    this.config = config;
    this.cache = cache;
  }

  async request(target, cacheKey) {
    const retries = this.config.httpRetries ?? 0;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(target.url, {
          redirect: "follow",
          signal: AbortSignal.timeout(this.config.httpTimeoutMs),
          headers: {
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "accept-language": this.config.locale,
            "user-agent": this.config.userAgent,
            ...this.cache.conditionalHeaders(cacheKey),
          },
        });
        const transient = [429, 502, 503, 504].includes(response.status);
        if (!transient || attempt === retries) return response;
        await response.body?.cancel();
        await sleep(retryDelay(response, attempt, this.config.httpRetryBaseMs ?? 500));
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
        await sleep(retryDelay(null, attempt, this.config.httpRetryBaseMs ?? 500));
      }
    }
    throw new BrowserFallbackError(`HTTP transport failed: ${lastError?.message || "unknown network error"}`);
  }

  async scrape(target) {
    if (this.config.proxy) throw new BrowserFallbackError("runtime proxy requires browser transport");
    const startedAt = Date.now();
    const cacheKey = `${target.url}::${target.extractor}::v${CACHE_VERSION}`;
    const cached = this.cache.get(cacheKey);
    const response = await this.request(target, cacheKey);

    if (response.status === 304 && cached?.payload) {
      return {
        ...cached.payload,
        checkedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        cacheStatus: "not_modified",
        upstreamStatus: 304,
      };
    }
    if (!response.ok) throw new BrowserFallbackError(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    const expectsHtml = ["page", "jobs"].includes(target.extractor);
    if (expectsHtml && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new BrowserFallbackError(`unsupported content type: ${contentType || "unknown"}`);
    }

    const { html: body, bytes } = await readLimitedBody(response, this.config.maxResponseBytes);
    const contentHash = createHash("sha256").update(body).digest("hex");
    if (cached?.contentHash === contentHash && cached.payload) {
      return {
        ...cached.payload,
        checkedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        bytes,
        cacheStatus: "content_unchanged",
      };
    }

    const fetchedAt = new Date().toISOString();
    let payload;
    if (target.extractor === "jobs") {
      const jobs = jobsPayload(body, target, response.url);
      if (jobs.length === 0) throw new BrowserFallbackError("static HTML contained no matching jobs");
      payload = {
        company: target.company,
        careersUrl: target.careersUrl,
        status: response.status,
        jobs,
        jobCount: jobs.length,
        fetchedAt,
      };
    } else if (target.extractor === "page") {
      const data = pagePayload(body, response.url);
      if (data.text.length < 80 && data.links.length === 0) {
        throw new BrowserFallbackError("static HTML had insufficient page content");
      }
      payload = {
        name: target.name,
        sourceUrl: target.url,
        finalUrl: response.url,
        status: response.status,
        fetchedAt,
        data,
      };
    } else if (target.extractor === "json") {
      let data;
      try {
        data = JSON.parse(body);
      } catch (error) {
        throw new Error(`Invalid JSON response: ${error.message}`);
      }
      payload = {
        name: target.name,
        sourceUrl: target.url,
        finalUrl: response.url,
        status: response.status,
        fetchedAt,
        data,
      };
    } else {
      payload = {
        name: target.name,
        sourceUrl: target.url,
        finalUrl: response.url,
        status: response.status,
        fetchedAt,
        text: body,
      };
    }
    payload = {
      ...payload,
      transport: "http",
      bytes,
      contentHash,
      cacheStatus: "miss",
      elapsedMs: Date.now() - startedAt,
    };
    this.cache.set(cacheKey, {
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      contentHash,
      payload,
    });
    return payload;
  }
}
