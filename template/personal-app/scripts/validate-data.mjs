import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const inputs = ["data/records.json", "demo/records.json"];
const allowedRecordKeys = new Set([
  "id",
  "title",
  "body",
  "tags",
  "occurredAt",
  "createdAt",
  "updatedAt",
]);

for (const input of inputs) {
  const collection = JSON.parse(await readFile(new URL(`../${input}`, import.meta.url), "utf8"));
  assert.deepEqual(
    Object.keys(collection).sort(),
    ["records", "schemaVersion"],
    `${input}: unexpected collection keys`,
  );
  assert.equal(collection.schemaVersion, 1, `${input}: unsupported schemaVersion`);
  assert.ok(Array.isArray(collection.records), `${input}: records must be an array`);

  const ids = new Set();
  for (const [index, record] of collection.records.entries()) {
    const label = `${input}: records[${index}]`;
    assert.equal(typeof record, "object", `${label} must be an object`);
    assert.ok(record !== null && !Array.isArray(record), `${label} must be an object`);
    assert.ok(Object.keys(record).every((key) => allowedRecordKeys.has(key)), `${label} has unknown keys`);
    assert.equal(typeof record.id, "string", `${label}.id must be a string`);
    assert.ok(record.id.length > 0, `${label}.id must not be empty`);
    assert.ok(!ids.has(record.id), `${label}.id must be unique`);
    ids.add(record.id);
    assert.equal(typeof record.title, "string", `${label}.title must be a string`);
    assert.ok(record.title.length > 0, `${label}.title must not be empty`);
    assert.equal(typeof record.body, "string", `${label}.body must be a string`);
    assert.ok(Array.isArray(record.tags), `${label}.tags must be an array`);
    assert.ok(record.tags.every((tag) => typeof tag === "string" && tag.length > 0), `${label}.tags must contain non-empty strings`);
    assert.equal(new Set(record.tags).size, record.tags.length, `${label}.tags must be unique`);

    for (const field of ["occurredAt", "createdAt", "updatedAt"]) {
      assert.equal(typeof record[field], "string", `${label}.${field} must be a string`);
      assert.ok(!Number.isNaN(Date.parse(record[field])), `${label}.${field} must be an ISO date-time`);
    }
  }
}

console.log(`Validated ${inputs.length} record collections.`);
