import {
  type PublicReleaseManifest,
  type PublicReleaseReconciliation,
  type ReleaseCandidate,
  type SchedulerJobManifest,
} from "./types.js";
import { validatePublicReleaseManifest, validateReleaseCandidate, validateSchedulerJob } from "./validation.js";

export function assertPromotableCandidate(candidate: ReleaseCandidate): void {
  validateReleaseCandidate(candidate);
  if (candidate.review.status !== "approved") throw new Error("Only an approved release candidate may be promoted.");
}

export function validateReleaseCandidateForJob(candidate: ReleaseCandidate, job: SchedulerJobManifest): void {
  validateSchedulerJob(job);
  validateReleaseCandidate(candidate);
  if (candidate.appId !== job.appId || candidate.jobId !== job.id) {
    throw new Error("Release candidate does not belong to the scheduler job.");
  }
  for (const file of candidate.files) {
    if (!isWithin(file.sourcePath, job.editorial.draftRoot)) throw new Error("Release source path is outside the configured draftRoot.");
    if (!isWithin(file.publicPath, job.publication.contentRoot)) throw new Error("Release public path is outside the configured contentRoot.");
  }
}

export function validatePublicReleaseForJob(manifest: PublicReleaseManifest, job: SchedulerJobManifest): void {
  validateSchedulerJob(job);
  validatePublicReleaseManifest(manifest);
  if (manifest.appId !== job.appId || manifest.jobId !== job.id) {
    throw new Error("Public release does not belong to the scheduler job.");
  }
  for (const file of manifest.files) {
    if (!isWithin(file.path, job.publication.contentRoot)) throw new Error("Public release path is outside the configured contentRoot.");
  }
}

export function publicReleaseManifestPath(job: SchedulerJobManifest, releaseKey: string): string {
  validateSchedulerJob(job);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(releaseKey) || releaseKey.length > 200) {
    throw new Error("Release key must be a path-safe stable identifier.");
  }
  return `${job.publication.releaseManifestRoot}/${releaseKey}.json`;
}

export function reconcilePublicRelease(
  existing: PublicReleaseManifest | undefined,
  candidate: Pick<ReleaseCandidate, "releaseKey" | "digest">
): PublicReleaseReconciliation {
  if (existing === undefined) return "create";
  validatePublicReleaseManifest(existing);
  if (existing.releaseKey !== candidate.releaseKey) {
    throw new Error("The existing public release has a different release key.");
  }
  return existing.digest === candidate.digest ? "already-promoted" : "conflict";
}

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root.replace(/\/$/, "")}/`);
}
