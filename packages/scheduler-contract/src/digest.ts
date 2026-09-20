import { createHash } from "node:crypto";
import type { PublicReleaseFile } from "./types.js";

export function sha256Text(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function computeReleaseDigest(files: readonly PublicReleaseFile[]): string {
  if (!files.length) throw new Error("A release digest requires at least one public file.");
  const sorted = [...files].sort((left, right) => left.path.localeCompare(right.path));
  const paths = new Set<string>();
  const canonical = sorted.map((file) => {
    if (!file.path || paths.has(file.path)) throw new Error("Release digest paths must be non-empty and unique.");
    if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("Release digest inputs require lowercase SHA-256 file digests.");
    paths.add(file.path);
    return `${file.path}\0${file.sha256}\n`;
  }).join("");
  return sha256Text(canonical);
}
