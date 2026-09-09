import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class HttpCache {
  constructor(path) {
    this.path = path;
    this.entries = new Map();
    this.dirty = false;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8"));
      this.entries = new Map(Object.entries(parsed.entries || {}));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this;
  }

  get(url) {
    return this.entries.get(url);
  }

  set(url, entry) {
    this.entries.set(url, entry);
    this.dirty = true;
  }

  conditionalHeaders(url) {
    const entry = this.get(url);
    return {
      ...(entry?.etag ? { "if-none-match": entry.etag } : {}),
      ...(entry?.lastModified ? { "if-modified-since": entry.lastModified } : {}),
    };
  }

  async save() {
    if (!this.dirty) return;
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, entries: Object.fromEntries(this.entries) })}\n`);
    await rename(temporary, this.path);
    this.dirty = false;
  }
}
