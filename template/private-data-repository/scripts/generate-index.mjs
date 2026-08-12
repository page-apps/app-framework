import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../data/records.json", import.meta.url);
const outputUrl = new URL("../generated/index.json", import.meta.url);
const collection = JSON.parse(await readFile(sourceUrl, "utf8"));
const generated = JSON.stringify({
  schemaVersion: 1,
  recordCount: collection.records.length,
  records: collection.records.map(({ id, title }) => ({ id, title })),
}, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== generated) throw new Error("generated/index.json is stale. Run the generator.");
} else {
  await writeFile(outputUrl, generated);
}
