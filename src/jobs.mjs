const GENERIC_LINK_TEXT = /^(apply( for position)?|read more|learn more|view (job|role|position)|details|open role|job details)$/i;

function clean(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function titleFrom(anchor) {
  const candidates = [
    anchor.roleText,
    anchor.headingText,
    anchor.primaryText,
    anchor.ariaLabel,
    anchor.title,
    anchor.text,
    anchor.context,
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(/\n+/))
    .map(clean)
    .map((value) => value.replace(/\s*(?:[-—|·]\s*)?(apply( for position)?|read more|learn more)\s*[→›]*$/i, "").trim())
    .filter((value) => value.length >= 3 && value.length <= 180)
    .filter((value) => !GENERIC_LINK_TEXT.test(value));

  return candidates[0] || new URL(anchor.url).pathname.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ") || "Untitled role";
}

export function extractJobRecords(anchors, target) {
  const patterns = target.jobUrlIncludes || [];
  const careersUrl = new URL(target.careersUrl);
  const seen = new Set();

  return anchors.flatMap((anchor) => {
    let url;
    try {
      url = new URL(anchor.href, careersUrl);
    } catch {
      return [];
    }
    if (!/^https?:$/.test(url.protocol) || url.href === careersUrl.href) return [];
    if (!patterns.some((pattern) => url.href.includes(pattern)) || seen.has(url.href)) return [];
    seen.add(url.href);

    return [{
      company: target.company,
      title: titleFrom({ ...anchor, url: url.href }),
      url: url.href,
      sourceUrl: careersUrl.href,
      context: clean(anchor.context).slice(0, 500),
    }];
  });
}

export async function extractJobsFromPage(page, target) {
  const anchors = await page.locator("a[href]").evaluateAll((elements) => elements.map((anchor) => {
    const container = anchor.closest("li, article, [role='listitem']") || anchor.parentElement;
    return {
      href: anchor.getAttribute("href") || "",
      text: anchor.innerText || anchor.textContent || "",
      roleText: anchor.querySelector("[data-testid*='title'], [class*='title'], h1, h2, h3, h4, h5, h6, p")?.textContent || "",
      headingText: anchor.querySelector("h1, h2, h3, h4, h5, h6")?.textContent || "",
      primaryText: anchor.firstElementChild?.textContent || "",
      ariaLabel: anchor.getAttribute("aria-label") || "",
      title: anchor.getAttribute("title") || "",
      context: container?.innerText || "",
    };
  }));

  return extractJobRecords(anchors, target);
}
