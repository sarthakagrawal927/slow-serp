const BLOCK_MARKERS = [
  "our systems have detected unusual traffic",
  "unusual traffic from your computer network",
  "automated queries",
  "not a robot",
  "recaptcha",
  "before you continue to google",
];

export function buildSearchUrl(query, options = {}) {
  const params = new URLSearchParams({
    q: query,
    hl: options.hl || "en",
    gl: options.gl || "us",
    num: String(options.num || 10),
    filter: "0",
  });
  if (options.start) params.set("start", String(options.start));
  return `https://www.google.com/search?${params}`;
}

export function detectBlock({ url = "", title = "", bodyText = "", status = 200 }) {
  const haystack = `${url}\n${title}\n${bodyText}`.toLowerCase();
  if (status === 403 || status === 429) {
    return { blocked: true, reason: `http_${status}` };
  }
  if (url.includes("/sorry/")) return { blocked: true, reason: "google_sorry_page" };
  const marker = BLOCK_MARKERS.find((candidate) => haystack.includes(candidate));
  return marker
    ? { blocked: true, reason: marker === "before you continue to google" ? "consent_required" : "challenge_page" }
    : { blocked: false, reason: null };
}

export function validateSearchRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Body must be a JSON object");
  }
  const q = typeof input.q === "string" ? input.q.trim() : "";
  if (!q || q.length > 500) throw new TypeError("q must be between 1 and 500 characters");

  const num = input.num === undefined ? 10 : Number(input.num);
  const start = input.start === undefined ? 0 : Number(input.start);
  if (!Number.isInteger(num) || num < 1 || num > 10) {
    throw new TypeError("num must be an integer between 1 and 10");
  }
  if (!Number.isInteger(start) || start < 0 || start > 90) {
    throw new TypeError("start must be an integer between 0 and 90");
  }

  const language = typeof input.hl === "string" && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(input.hl)
    ? input.hl
    : "en";
  const country = typeof input.gl === "string" && /^[a-z]{2}$/i.test(input.gl)
    ? input.gl.toLowerCase()
    : "us";

  return { q, num, start, hl: language, gl: country };
}

export async function extractOrganicResults(page, limit) {
  const candidates = await page.locator("a:has(h3)").evaluateAll((anchors) =>
    anchors.map((anchor) => {
      const heading = anchor.querySelector("h3");
      const href = anchor.href;
      let container = anchor.parentElement;
      for (let i = 0; i < 4 && container; i += 1) {
        if (container.innerText?.length > (heading?.innerText?.length || 0) + 20) break;
        container = container.parentElement;
      }
      const text = container?.innerText || "";
      const title = heading?.innerText?.trim() || "";
      const snippet = text
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part !== title && !href.includes(part))
        .join(" ")
        .slice(0, 700);
      return { title, url: href, snippet };
    }),
  );

  const seen = new Set();
  return candidates.filter((result) => {
    if (!result.title || !/^https?:\/\//.test(result.url)) return false;
    const host = new URL(result.url).hostname;
    if (host.endsWith("google.com") || seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  }).slice(0, limit);
}
