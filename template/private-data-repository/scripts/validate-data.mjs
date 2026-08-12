import { readFile } from "node:fs/promises";

const collection = JSON.parse(await readFile(new URL("../data/records.json", import.meta.url), "utf8"));
JSON.parse(await readFile(new URL("../schemas/records.schema.json", import.meta.url), "utf8"));

if (collection?.schemaVersion !== 1 || !Array.isArray(collection.records)) {
  throw new Error("data/records.json must contain schemaVersion 1 and a records array.");
}

const ids = new Set();
for (const [index, record] of collection.records.entries()) {
  if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id.trim() ||
    typeof record.title !== "string" || !record.title.trim()) {
    throw new Error(`Record ${index} requires non-empty id and title strings.`);
  }
  if (ids.has(record.id)) throw new Error(`Duplicate record id: ${record.id}`);
  ids.add(record.id);
}

console.log(`Validated ${collection.records.length} private records.`);
