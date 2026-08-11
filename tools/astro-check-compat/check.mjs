import { fileURLToPath } from "node:url";
import { check } from "@astrojs/check";

const root = fileURLToPath(new URL("../../quick-log/", import.meta.url));
console.info(`Getting Astro diagnostics for ${root}`);

const failed = await check({
  root,
  watch: false,
  minimumFailingSeverity: "error",
  minimumSeverity: "hint",
  preserveWatchOutput: false,
});

if (failed) process.exitCode = 1;
