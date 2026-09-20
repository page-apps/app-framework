import { access, readFile } from "node:fs/promises";

const files = {
  html: new URL("../site/index.html", import.meta.url),
  css: new URL("../site/styles.css", import.meta.url),
};

for (const [name, file] of Object.entries(files)) {
  await access(file);
  const contents = await readFile(file, "utf8");
  if (!contents.trim()) throw new Error(`${name} must not be empty`);
  if (/github_pat_|ghp_[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]/i.test(contents)) {
    throw new Error(`${name} contains a credential-like value`);
  }
}

const html = await readFile(files.html, "utf8");
for (const required of ["App Framework", "Agent-produced public reader", "Temporal", "GitHub Actions", "Private by default"]) {
  if (!html.includes(required)) throw new Error(`site/index.html is missing required topic: ${required}`);
}

console.log("Validated App Framework documentation site.");
