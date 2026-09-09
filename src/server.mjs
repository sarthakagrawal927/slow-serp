import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { BlockedError } from "./scraper.mjs";
import { QueueFullError } from "./paced-queue.mjs";
import { validateSearchRequest } from "./google.mjs";

const MAX_BODY_BYTES = 32 * 1024;

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

function matchesApiKey(received, expected) {
  if (!expected) return true;
  if (!received?.startsWith("Bearer ")) return false;
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received.slice(7)), digest(expected));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Body must be valid JSON"), { status: 400 });
  }
}

export function createScraperServer({ scraper, config, logger = console }) {
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader("x-request-id", requestId);

    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { ok: true, ...scraper.status() });
      }

      if (request.method !== "POST" || url.pathname !== "/v1/search") {
        return json(response, 404, { error: "not_found", requestId });
      }

      if (!matchesApiKey(request.headers.authorization, config.apiKey)) {
        return json(response, 401, { error: "unauthorized", requestId });
      }

      const input = validateSearchRequest(await readJson(request));
      const result = await scraper.search(input);
      logger.info({ requestId, queryLength: input.q.length, resultCount: result.resultCount }, "search_complete");
      return json(response, 200, { requestId, ...result });
    } catch (error) {
      const status = error.status
        || (error instanceof QueueFullError ? 429 : 0)
        || (error instanceof BlockedError ? 503 : 0)
        || (error instanceof TypeError ? 400 : 500);
      const code = error instanceof BlockedError
        ? "upstream_blocked"
        : error instanceof QueueFullError
          ? "queue_full"
          : status >= 500
            ? "internal_error"
            : "bad_request";
      logger.error({ requestId, code, message: error.message }, "search_failed");
      return json(response, status, {
        error: code,
        message: error.message,
        ...(error instanceof BlockedError ? { reason: error.reason } : {}),
        requestId,
      });
    }
  });
}
