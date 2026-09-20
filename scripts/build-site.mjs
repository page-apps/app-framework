import { cp, rm } from "node:fs/promises";

const source = new URL("../site/", import.meta.url);
const output = new URL("../.pages-dist/", import.meta.url);

await import(new URL("./validate-site.mjs", import.meta.url));
await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });
console.log("Built .pages-dist for GitHub Pages.");
