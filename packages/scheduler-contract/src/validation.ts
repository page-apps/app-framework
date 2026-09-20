import {
  PUBLIC_RELEASE_SCHEMA,
  RELEASE_CANDIDATE_SCHEMA,
  SCHEDULER_JOB_SCHEMA,
  SCHEDULER_RUN_SCHEMA,
  SCHEDULER_RUN_STATES,
  type PublicReleaseManifest,
  type ReleaseCandidate,
  type SchedulerJobManifest,
  type SchedulerLease,
  type SchedulerRepositoryTarget,
  type SchedulerRunRecord,
} from "./types.js";
import { computeReleaseDigest } from "./digest.js";

const sha256Pattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-z0-9][a-z0-9._:-]*$/;

export function defineSchedulerJob<const T extends SchedulerJobManifest>(job: T): Readonly<T> {
  validateSchedulerJob(job);
  return Object.freeze(job);
}

export function validateSchedulerJob(job: SchedulerJobManifest): void {
  assertKnownKeys(job, ["schema", "id", "appId", "enabled", "trigger", "pipeline", "editorial", "publication", "review", "concurrency", "retry"], "Scheduler job");
  if (job.schema !== SCHEDULER_JOB_SCHEMA) throw new Error(`Scheduler job schema must be ${SCHEDULER_JOB_SCHEMA}.`);
  assertId(job.id, "Scheduler job id");
  assertId(job.appId, "Scheduler app id");
  if (typeof job.enabled !== "boolean") throw new Error("Scheduler enabled must be a boolean.");
  assertId(job.pipeline.id, "Scheduler pipeline id");
  if (job.trigger.kind === "cron") {
    assertKnownKeys(job.trigger, ["kind", "expression", "timeZone", "misfire"], "Scheduler cron trigger");
    if (job.trigger.expression.trim().split(/\s+/).length !== 5) {
      throw new Error("A scheduler cron trigger requires a five-field expression.");
    }
    assertTimeZone(job.trigger.timeZone);
    if (job.trigger.misfire !== "skip" && job.trigger.misfire !== "run-latest") {
      throw new Error("Scheduler misfire policy must be skip or run-latest.");
    }
  } else if (job.trigger.kind !== "external") {
    throw new Error("Scheduler trigger must be cron or external.");
  } else {
    assertKnownKeys(job.trigger, ["kind"], "Scheduler external trigger");
  }
  assertKnownKeys(job.pipeline, ["id", "command", "args"], "Scheduler pipeline");
  if (!job.pipeline.command.trim() || job.pipeline.command.includes("\0")) {
    throw new Error("Scheduler pipeline command is required.");
  }
  for (const arg of job.pipeline.args ?? []) {
    if (arg.includes("\0")) throw new Error("Scheduler pipeline arguments must not contain NUL bytes.");
  }
  validateRepository(job.editorial.repository, "editorial");
  validateRepository(job.publication.repository, "publication");
  assertKnownKeys(job.editorial, ["repository", "draftRoot", "runRoot"], "Scheduler editorial boundary");
  assertKnownKeys(job.publication, ["repository", "contentRoot", "releaseManifestRoot", "mode"], "Scheduler publication boundary");
  if (sameRepository(job.editorial.repository, job.publication.repository)) {
    throw new Error("Editorial and publication repositories must be separate scheduler boundaries.");
  }
  assertSafePath(job.editorial.draftRoot, "Editorial draftRoot");
  assertSafePath(job.editorial.runRoot, "Editorial runRoot");
  assertDistinctRoots(job.editorial.draftRoot, job.editorial.runRoot, "Editorial draftRoot and runRoot");
  assertSafePath(job.publication.contentRoot, "Publication contentRoot");
  assertSafePath(job.publication.releaseManifestRoot, "Publication releaseManifestRoot");
  assertDistinctRoots(job.publication.contentRoot, job.publication.releaseManifestRoot, "Publication contentRoot and releaseManifestRoot");
  if (job.publication.mode !== "direct" && job.publication.mode !== "pull-request") {
    throw new Error("Publication mode must be direct or pull-request.");
  }
  if (!["none", "human", "automatic", "automatic-or-human"].includes(job.review.mode)) {
    throw new Error("Scheduler review mode is invalid.");
  }
  assertKnownKeys(job.review, ["mode"], "Scheduler review policy");
  assertKnownKeys(job.concurrency, ["overlap"], "Scheduler concurrency policy");
  if (job.concurrency.overlap !== "skip" && job.concurrency.overlap !== "buffer-one") {
    throw new Error("Scheduler overlap policy must be skip or buffer-one.");
  }
  if (!Number.isInteger(job.retry.maxAttempts) || job.retry.maxAttempts < 1 || job.retry.maxAttempts > 10) {
    throw new Error("Scheduler maxAttempts must be an integer from 1 to 10.");
  }
  if (job.retry.strategy !== "fixed" && job.retry.strategy !== "exponential") {
    throw new Error("Scheduler retry strategy must be fixed or exponential.");
  }
  assertKnownKeys(job.retry, ["maxAttempts", "strategy", "baseDelaySeconds", "maxDelaySeconds"], "Scheduler retry policy");
  if (!Number.isInteger(job.retry.baseDelaySeconds) || job.retry.baseDelaySeconds < 1 ||
    !Number.isInteger(job.retry.maxDelaySeconds) || job.retry.maxDelaySeconds < job.retry.baseDelaySeconds ||
    job.retry.maxDelaySeconds > 86_400) {
    throw new Error("Scheduler retry delays must be positive integers with maxDelaySeconds between baseDelaySeconds and 86400.");
  }
}

export function validateSchedulerRun(run: SchedulerRunRecord): void {
  assertKnownKeys(run, ["schema", "executionId", "jobId", "occurrenceKey", "scheduledFor", "attempt", "state", "updatedAt", "startedAt", "candidate", "review", "publication", "deployment", "failure", "nextAttemptAt"], "Scheduler run");
  if (run.schema !== SCHEDULER_RUN_SCHEMA) throw new Error(`Scheduler run schema must be ${SCHEDULER_RUN_SCHEMA}.`);
  assertOpaque(run.executionId, "Scheduler execution id");
  assertId(run.jobId, "Scheduler run job id");
  assertOpaque(run.occurrenceKey, "Scheduler occurrence key");
  assertTimestamp(run.scheduledFor, "scheduledFor");
  assertTimestamp(run.updatedAt, "updatedAt");
  if (run.startedAt !== undefined) assertTimestamp(run.startedAt, "startedAt");
  if (!Number.isInteger(run.attempt) || run.attempt < 1) throw new Error("Scheduler run attempt must be a positive integer.");
  if (!(SCHEDULER_RUN_STATES as readonly string[]).includes(run.state)) throw new Error("Scheduler run state is invalid.");
  if (!["queued", "skipped", "cancelled"].includes(run.state) && run.startedAt === undefined) {
    throw new Error(`Scheduler run state ${run.state} requires startedAt.`);
  }
  if (run.candidate !== undefined) {
    assertKnownKeys(run.candidate, ["releaseKey", "digest", "draftId", "sourceRevision"], "Scheduler candidate reference");
    assertReleaseKey(run.candidate.releaseKey, "Candidate release key");
    assertSha256(run.candidate.digest, "Candidate digest");
    assertOpaque(run.candidate.draftId, "Candidate draft id");
    assertOpaque(run.candidate.sourceRevision, "Candidate source revision");
  }
  if (["approved", "promoting", "promoted", "building", "published"].includes(run.state) && run.candidate === undefined) {
    throw new Error(`Scheduler run state ${run.state} requires a release candidate.`);
  }
  if (run.review !== undefined) {
    assertKnownKeys(run.review, ["status", "checkedAt", "actor"], "Scheduler review record");
    assertTimestamp(run.review.checkedAt, "review.checkedAt");
    if (run.review.actor !== undefined) assertOpaque(run.review.actor, "Review actor");
  }
  if (run.state === "needs-review" && run.review?.status !== "needs-review") {
    throw new Error("A needs-review run requires a needs-review record.");
  }
  if (["approved", "promoting", "promoted", "building", "published"].includes(run.state) && run.review?.status !== "approved") {
    throw new Error(`Scheduler run state ${run.state} requires approval.`);
  }
  if (run.publication !== undefined) {
    assertKnownKeys(run.publication, ["releaseKey", "digest", "manifestPath", "commitSha", "commitUrl"], "Scheduler publication record");
    assertReleaseKey(run.publication.releaseKey, "Publication release key");
    assertSha256(run.publication.digest, "Publication digest");
    assertSafePath(run.publication.manifestPath, "Publication manifest path");
    assertOpaque(run.publication.commitSha, "Publication commit SHA");
    if (run.candidate !== undefined &&
      (run.publication.releaseKey !== run.candidate.releaseKey || run.publication.digest !== run.candidate.digest)) {
      throw new Error("Publication identity must match the approved candidate.");
    }
  }
  if (["promoted", "building", "published"].includes(run.state) && run.publication === undefined) {
    throw new Error(`Scheduler run state ${run.state} requires a publication record.`);
  }
  if (run.deployment !== undefined) {
    assertKnownKeys(run.deployment, ["commitSha", "observedAt", "workflowRunId", "deploymentId", "url"], "Scheduler deployment record");
    assertOpaque(run.deployment.commitSha, "Deployment commit SHA");
    assertTimestamp(run.deployment.observedAt, "deployment.observedAt");
  }
  if (run.state === "published") {
    if (run.deployment === undefined || run.publication === undefined) {
      throw new Error("A published run requires publication and deployment records.");
    }
    if (run.deployment.commitSha !== run.publication.commitSha) {
      throw new Error("Published deployment must match the promoted public commit.");
    }
  }
  if (run.failure !== undefined) {
    assertKnownKeys(run.failure, ["classification", "code", "message"], "Scheduler failure record");
    assertId(run.failure.code, "Scheduler failure code");
    if (!run.failure.message.trim() || run.failure.message.length > 2_000) {
      throw new Error("Scheduler failure message must be a sanitized summary of at most 2000 characters.");
    }
  }
  if (run.state === "retry-wait") {
    if (run.failure?.classification !== "retryable" || run.nextAttemptAt === undefined) {
      throw new Error("A retry-wait run requires a retryable failure and nextAttemptAt.");
    }
    assertTimestamp(run.nextAttemptAt, "nextAttemptAt");
  } else if (run.nextAttemptAt !== undefined) {
    throw new Error("nextAttemptAt is valid only for retry-wait runs.");
  }
  if (run.state === "failed" && run.failure === undefined) throw new Error("A failed run requires a failure record.");
  if (run.state === "conflicted" && run.failure?.classification !== "conflict") {
    throw new Error("A conflicted run requires a conflict failure.");
  }
}

export function validateSchedulerLease(lease: SchedulerLease): void {
  assertKnownKeys(lease, ["key", "owner", "acquiredAt", "expiresAt", "fencingToken"], "Scheduler lease");
  assertId(lease.key, "Scheduler lease key");
  assertOpaque(lease.owner, "Scheduler lease owner");
  assertTimestamp(lease.acquiredAt, "lease.acquiredAt");
  assertTimestamp(lease.expiresAt, "lease.expiresAt");
  assertOpaque(lease.fencingToken, "Scheduler fencing token");
  if (Date.parse(lease.expiresAt) <= Date.parse(lease.acquiredAt)) throw new Error("Scheduler lease must expire after acquisition.");
}

export function validateReleaseCandidate(candidate: ReleaseCandidate): void {
  assertKnownKeys(candidate, ["schema", "appId", "jobId", "releaseKey", "sourceDraftId", "sourceRevision", "digest", "files", "review"], "Release candidate");
  if (candidate.schema !== RELEASE_CANDIDATE_SCHEMA) throw new Error(`Release candidate schema must be ${RELEASE_CANDIDATE_SCHEMA}.`);
  assertId(candidate.appId, "Release candidate app id");
  assertId(candidate.jobId, "Release candidate job id");
  assertReleaseKey(candidate.releaseKey, "Release key");
  assertOpaque(candidate.sourceDraftId, "Source draft id");
  assertOpaque(candidate.sourceRevision, "Source revision");
  validateCandidateFiles(candidate.files);
  assertSha256(candidate.digest, "Release candidate digest");
  const expected = computeReleaseDigest(candidate.files.map((file) => ({ path: file.publicPath, sha256: file.sha256 })));
  if (candidate.digest !== expected) throw new Error("Release candidate digest does not match its public files.");
  assertOpaque(candidate.review.actor, "Release reviewer");
  assertKnownKeys(candidate.review, ["status", "actor", "checkedAt"], "Release review");
  assertTimestamp(candidate.review.checkedAt, "release review checkedAt");
  if (!["approved", "rejected", "needs-review"].includes(candidate.review.status)) throw new Error("Release review status is invalid.");
}

export function validatePublicReleaseManifest(manifest: PublicReleaseManifest): void {
  assertKnownKeys(manifest, ["schema", "appId", "jobId", "releaseKey", "digest", "generatedAt", "promotedAt", "files", "provenance"], "Public release manifest");
  if (manifest.schema !== PUBLIC_RELEASE_SCHEMA) throw new Error(`Public release schema must be ${PUBLIC_RELEASE_SCHEMA}.`);
  assertId(manifest.appId, "Public release app id");
  assertId(manifest.jobId, "Public release job id");
  assertReleaseKey(manifest.releaseKey, "Public release key");
  assertTimestamp(manifest.generatedAt, "generatedAt");
  assertTimestamp(manifest.promotedAt, "promotedAt");
  if (Date.parse(manifest.promotedAt) < Date.parse(manifest.generatedAt)) throw new Error("Public release promotedAt must not precede generatedAt.");
  validatePublicFiles(manifest.files);
  assertSha256(manifest.digest, "Public release digest");
  if (manifest.digest !== computeReleaseDigest(manifest.files)) throw new Error("Public release digest does not match its files.");
  assertOpaque(manifest.provenance.generator, "Public release generator");
  assertKnownKeys(manifest.provenance, ["generator", "reviewer"], "Public release provenance");
  if (manifest.provenance.reviewer !== undefined) assertOpaque(manifest.provenance.reviewer, "Public release reviewer");
}

function validateCandidateFiles(files: ReleaseCandidate["files"]): void {
  if (!files.length) throw new Error("A release candidate requires at least one file.");
  const sources = new Set<string>();
  const targets = new Set<string>();
  for (const file of files) {
    assertKnownKeys(file, ["sourcePath", "publicPath", "sha256"], "Release candidate file");
    assertSafePath(file.sourcePath, "Release source path");
    assertSafePath(file.publicPath, "Release public path");
    assertSha256(file.sha256, "Release file SHA-256");
    if (sources.has(file.sourcePath) || targets.has(file.publicPath)) throw new Error("Release candidate paths must be unique.");
    sources.add(file.sourcePath);
    targets.add(file.publicPath);
  }
}

function validatePublicFiles(files: PublicReleaseManifest["files"]): void {
  if (!files.length) throw new Error("A public release requires at least one file.");
  const paths = files.map((file) => file.path);
  for (const file of files) {
    assertKnownKeys(file, ["path", "sha256"], "Public release file");
    assertSafePath(file.path, "Public release path");
    assertSha256(file.sha256, "Public release file SHA-256");
  }
  if (new Set(paths).size !== paths.length) throw new Error("Public release paths must be unique.");
  if (paths.some((path, index) => index > 0 && path.localeCompare(paths[index - 1]!) < 0)) {
    throw new Error("Public release files must be sorted by path.");
  }
}

function validateRepository(repository: SchedulerRepositoryTarget, label: string): void {
  assertKnownKeys(repository, ["owner", "name", "branch"], `Scheduler ${label} repository`);
  if (!repository.owner.trim() || !repository.name.trim() || !repository.branch.trim() ||
    repository.owner.includes("/") || repository.name.includes("/") || /\s/.test(repository.branch) ||
    repository.branch.startsWith("/") || repository.branch.endsWith("/") || repository.branch.includes("..")) {
    throw new Error(`Scheduler ${label} repository requires a safe owner, name and branch.`);
  }
}

function sameRepository(left: SchedulerRepositoryTarget, right: SchedulerRepositoryTarget): boolean {
  return left.owner === right.owner && left.name === right.name;
}

function assertId(value: string, label: string): void {
  if (!idPattern.test(value)) throw new Error(`${label} must be a lowercase stable identifier.`);
}

function assertOpaque(value: string, label: string): void {
  if (!value.trim() || value.includes("\0") || value.length > 500) throw new Error(`${label} is required and must be at most 500 characters.`);
}

function assertReleaseKey(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) || value.length > 200) {
    throw new Error(`${label} must be a path-safe stable identifier.`);
  }
}

function assertTimeZone(value: string): void {
  try { new Intl.DateTimeFormat("en-AU", { timeZone: value }).format(); }
  catch { throw new Error("Scheduler timeZone must be a valid IANA time zone."); }
}

function assertTimestamp(value: string, label: string): void {
  if (!value.trim() || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO-8601 timestamp.`);
}

function assertSha256(value: string, label: string): void {
  if (!sha256Pattern.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
}

function assertSafePath(value: string, label: string): void {
  const parts = value.split("/");
  if (!value || value.startsWith("/") || value.endsWith("/") || value.includes("\\") || /%2f|%5c/i.test(value) ||
    parts.some((part) => !part || part === "." || part === ".." || part.includes("\0"))) {
    throw new Error(`${label} must be a safe repository-relative path.`);
  }
}

function assertDistinctRoots(left: string, right: string, label: string): void {
  const a = left.replace(/\/$/, "");
  const b = right.replace(/\/$/, "");
  if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) throw new Error(`${label} must not overlap.`);
}

function assertKnownKeys(value: object, allowed: readonly string[], label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`${label} contains unknown fields: ${extras.join(", ")}.`);
}
