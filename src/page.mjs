function clean(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

export function validatePageTarget(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Target must be an object");
  }
  const name = clean(input.name);
  if (!name || name.length > 120) throw new TypeError("Target name must be between 1 and 120 characters");

  let url;
  try {
    url = new URL(input.url);
  } catch {
    throw new TypeError(`Target ${name} has an invalid URL`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new TypeError(`Target ${name} must use HTTP or HTTPS`);

  const extractor = input.extractor || "page";
  if (!["page", "jobs", "json", "text"].includes(extractor)) {
    throw new TypeError(`Target ${name} has unsupported extractor: ${extractor}`);
  }

  const transport = input.transport || (["json", "text"].includes(extractor) ? "http" : "auto");
  if (!["auto", "http", "browser"].includes(transport)) {
    throw new TypeError(`Target ${name} has unsupported transport: ${transport}`);
  }
  if (["json", "text"].includes(extractor) && transport !== "http") {
    throw new TypeError(`Target ${name} must use HTTP transport for the ${extractor} extractor`);
  }

  const target = { name, url: url.href, extractor, transport };
  if (extractor === "jobs") {
    if (!Array.isArray(input.jobUrlIncludes) || input.jobUrlIncludes.length === 0) {
      throw new TypeError(`Job target ${name} needs at least one jobUrlIncludes pattern`);
    }
    target.company = clean(input.company) || name;
    target.careersUrl = url.href;
    target.jobUrlIncludes = input.jobUrlIncludes.map(clean).filter(Boolean);
  }
  return target;
}

export async function extractPageData(page, target) {
  return page.evaluate(({ maxTextChars, maxLinks, maxHeadings }) => {
    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    const canonical = document.querySelector("link[rel='canonical']")?.href || null;
    const description = document.querySelector("meta[name='description']")?.content || null;
    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .map((element) => ({ level: Number(element.tagName.slice(1)), text: normalize(element.innerText) }))
      .filter((heading) => heading.text)
      .slice(0, maxHeadings);
    const seen = new Set();
    const links = [...document.querySelectorAll("a[href]")].flatMap((anchor) => {
      const url = anchor.href;
      if (!/^https?:\/\//.test(url) || seen.has(url)) return [];
      seen.add(url);
      return [{ text: normalize(anchor.innerText || anchor.textContent), url }];
    }).slice(0, maxLinks);

    return {
      title: document.title,
      description,
      canonicalUrl: canonical,
      headings,
      links,
      text: normalize(document.body?.innerText || "").slice(0, maxTextChars),
    };
  }, {
    maxTextChars: target.maxTextChars || 100_000,
    maxLinks: target.maxLinks || 1_000,
    maxHeadings: target.maxHeadings || 200,
  });
}
