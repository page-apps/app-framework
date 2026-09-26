import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_RELEASE_SCHEMA,
  RELEASE_CANDIDATE_SCHEMA,
  SCHEDULER_JOB_SCHEMA,
  assertPromotableCandidate,
  computeCanonicalDataDigest,
  computeReleaseDigest,
  createSchedulerRun,
  defineSchedulerJob,
  isLeaseExpired,
  reconcilePrivateCanonicalOutput,
  reconcilePublicRelease,
  retryDelaySeconds,
  sha256Text,
  transitionSchedulerRun,
  publicReleaseManifestPath,
  validatePublicReleaseManifest,
  validatePublicReleaseForJob,
  validateReleaseCandidateForJob,
  validateSchedulerRun,
} from "../dist/index.js";

const now = "2026-09-20T01:00:00+10:00";
const later = "2026-09-20T01:05:00+10:00";
const candidateFiles = [
  { sourcePath: "drafts/2026-09-20/ai/daily.md", publicPath: "content/daily/2026-09-20--ai.md", sha256: sha256Text("daily") },
  { sourcePath: "drafts/2026-09-20/ai/news/one.md", publicPath: "content/news/one.md", sha256: sha256Text("story") },
];
const digest = computeReleaseDigest(candidateFiles.map((file) => ({ path: file.publicPath, sha256: file.sha256 })));
const candidate = {
  schema: RELEASE_CANDIDATE_SCHEMA,
  appId: "ai-daily",
  jobId: "ai-daily:ai",
  releaseKey: "2026-09-20--ai",
  sourceDraftId: "drafts/2026-09-20/ai",
  sourceRevision: "private-commit",
  digest,
  files: candidateFiles,
  review: { status: "approved", actor: "machine:reviewer/luna", checkedAt: now },
};

const jobDefinition = {
  schema: SCHEDULER_JOB_SCHEMA,
  id: "ai-daily:ai",
  appId: "ai-daily",
  enabled: true,
  trigger: { kind: "cron", expression: "0 1 * * 1-5", timeZone: "Australia/Sydney", misfire: "run-latest" },
  pipeline: { id: "ai", command: "pnpm", args: ["scheduler:run", "--", "--pipeline=ai"] },
  editorial: {
    repository: { owner: "page-apps", name: "ai-daily-editorial", branch: "main" },
    draftRoot: "drafts",
    runRoot: "scheduler/runs",
  },
  publication: {
    repository: { owner: "page-apps", name: "ai-daily", branch: "main" },
    contentRoot: "content",
    releaseManifestRoot: "releases",
    mode: "direct",
  },
  review: { mode: "automatic-or-human" },
  concurrency: { overlap: "skip" },
  retry: { maxAttempts: 3, strategy: "exponential", baseDelaySeconds: 60, maxDelaySeconds: 900 },
};

const privateJobDefinition = {
  schema: SCHEDULER_JOB_SCHEMA,
  id: "tool-radar:refresh",
  appId: "tool-radar",
  enabled: true,
  trigger: { kind: "cron", expression: "0 3 * * *", timeZone: "Australia/Sydney", misfire: "run-latest" },
  pipeline: { id: "refresh", command: "pnpm", args: ["scheduler:run", "--", "--pipeline=refresh"] },
  output: {
    kind: "private-canonical",
    repository: { owner: "page-apps", name: "tool-radar-data", branch: "main" },
    canonicalRoot: "data",
    generatedRoot: "generated",
  },
  scheduler: {
    repository: { owner: "page-apps", name: "tool-radar-data", branch: "main" },
    runRoot: ".scheduler/runs",
  },
  review: { mode: "none" },
  concurrency: { overlap: "skip" },
  retry: { maxAttempts: 3, strategy: "fixed", baseDelaySeconds: 60, maxDelaySeconds: 300 },
};

test("defines a host-neutral scheduled reader job", () => {
  const job = defineSchedulerJob(jobDefinition);
  assert.equal(job.pipeline.id, "ai");
  assert.equal(Object.isFrozen(job), true);
});

test("defines a private-canonical job without public release boundaries", () => {
  const job = defineSchedulerJob(privateJobDefinition);
  assert.equal(job.output.kind, "private-canonical");
  assert.equal(job.output.canonicalRoot, "data");
  assert.equal(Object.isFrozen(job), true);
  assert.throws(() => defineSchedulerJob({
    ...privateJobDefinition,
    publication: jobDefinition.publication,
  }), /must not declare editorial or publication/);
});

test("rejects unsafe or ambiguous scheduler boundaries", () => {
  const base = {
    schema: SCHEDULER_JOB_SCHEMA,
    id: "job",
    appId: "app",
    enabled: true,
    trigger: { kind: "external" },
    pipeline: { id: "daily", command: "node" },
    editorial: { repository: { owner: "owner", name: "same", branch: "main" }, draftRoot: "drafts", runRoot: "runs" },
    publication: { repository: { owner: "owner", name: "same", branch: "main" }, contentRoot: "content", releaseManifestRoot: "releases", mode: "direct" },
    review: { mode: "automatic" },
    concurrency: { overlap: "skip" },
    retry: { maxAttempts: 2, strategy: "fixed", baseDelaySeconds: 30, maxDelaySeconds: 30 },
  };
  assert.throws(() => defineSchedulerJob(base), /must be separate/);
  assert.throws(() => defineSchedulerJob({ ...base, publication: { ...base.publication, repository: { owner: "owner", name: "public", branch: "main" }, contentRoot: "content", releaseManifestRoot: "content/releases" } }), /must not overlap/);
  assert.throws(() => defineSchedulerJob({
    ...base,
    publication: { ...base.publication, repository: { owner: "owner", name: "public", branch: "main" } },
    concurrency: { overlap: "allow-all" },
  }), /overlap policy/);
});

test("enforces the scheduler lifecycle through publication and matching deployment", () => {
  let run = createSchedulerRun({ executionId: "run-1", jobId: "ai-daily:ai", occurrenceKey: now, scheduledFor: now, createdAt: now });
  run = transitionSchedulerRun(run, "claimed", now, { startedAt: now });
  run = transitionSchedulerRun(run, "generating", now);
  run = transitionSchedulerRun(run, "validating", now, { candidate: {
    releaseKey: candidate.releaseKey, digest, draftId: candidate.sourceDraftId, sourceRevision: candidate.sourceRevision,
  } });
  run = transitionSchedulerRun(run, "approved", now, { review: { status: "approved", actor: candidate.review.actor, checkedAt: now } });
  run = transitionSchedulerRun(run, "promoting", now);
  run = transitionSchedulerRun(run, "promoted", later, { publication: {
    releaseKey: candidate.releaseKey, digest, manifestPath: "releases/2026-09-20--ai.json", commitSha: "public-commit",
  } });
  run = transitionSchedulerRun(run, "building", later);
  run = transitionSchedulerRun(run, "published", later, { deployment: { commitSha: "public-commit", observedAt: later, url: "https://page-apps.github.io/ai-daily/" } });
  assert.equal(run.state, "published");
  assert.throws(() => transitionSchedulerRun(run, "claimed", later), /Invalid scheduler run transition/);
});

test("supports a private canonical-data lifecycle without promotion or deployment", () => {
  const outputDigest = computeCanonicalDataDigest([
    { path: "data/tools.json", sha256: sha256Text("tools") },
    { path: "generated/summaries.json", sha256: sha256Text("summaries") },
  ]);
  let run = createSchedulerRun({
    executionId: "private-run-1",
    jobId: privateJobDefinition.id,
    occurrenceKey: now,
    scheduledFor: now,
    createdAt: now,
    outputKind: "private-canonical",
  });
  run = transitionSchedulerRun(run, "claimed", now, { startedAt: now });
  run = transitionSchedulerRun(run, "generating", now);
  run = transitionSchedulerRun(run, "validating", now);
  run = transitionSchedulerRun(run, "committing", now);
  run = transitionSchedulerRun(run, "committed", later, {
    canonicalData: { outputKey: "2026-09-20--refresh", digest: outputDigest, commitSha: "private-commit" },
  });
  assert.equal(run.state, "committed");
  assert.equal(run.canonicalData.commitSha, "private-commit");
  assert.throws(() => transitionSchedulerRun(run, "published", later), /Invalid scheduler run transition/);
  assert.equal(reconcilePrivateCanonicalOutput(undefined, { outputKey: "2026-09-20--refresh", digest: outputDigest }), "create");
  assert.equal(reconcilePrivateCanonicalOutput(run.canonicalData, { outputKey: "2026-09-20--refresh", digest: outputDigest }), "already-committed");
  assert.equal(reconcilePrivateCanonicalOutput(run.canonicalData, { outputKey: "2026-09-20--refresh", digest: "f".repeat(64) }), "conflict");
});

test("keeps retries in one logical run and increments attempts", () => {
  let run = createSchedulerRun({ executionId: "run-2", jobId: "ai-daily:ai", occurrenceKey: now, scheduledFor: now, createdAt: now });
  run = transitionSchedulerRun(run, "claimed", now, { startedAt: now });
  run = transitionSchedulerRun(run, "generating", now);
  run = transitionSchedulerRun(run, "retry-wait", now, {
    failure: { classification: "retryable", code: "model-quota", message: "Model quota is temporarily unavailable." },
    nextAttemptAt: later,
  });
  run = transitionSchedulerRun(run, "claimed", later);
  assert.equal(run.attempt, 2);
  assert.equal(run.failure, undefined);
  assert.equal(run.nextAttemptAt, undefined);
  assert.equal(retryDelaySeconds("exponential", 4, 60, 300), 300);
});

test("requires the deployed commit to equal the promoted commit", () => {
  assert.throws(() => validateSchedulerRun({
    schema: "repo-apps/scheduler-run/v1",
    executionId: "run",
    jobId: "job",
    occurrenceKey: now,
    scheduledFor: now,
    attempt: 1,
    state: "published",
    startedAt: now,
    updatedAt: later,
    candidate: { releaseKey: "release", digest, draftId: "draft", sourceRevision: "private" },
    review: { status: "approved", actor: "human:owner", checkedAt: now },
    publication: { releaseKey: "release", digest, manifestPath: "releases/release.json", commitSha: "public-one" },
    deployment: { commitSha: "public-two", observedAt: later },
  }), /must match/);
});

test("validates release digests and reconciles idempotent promotion", () => {
  assertPromotableCandidate(candidate);
  const manifest = {
    schema: PUBLIC_RELEASE_SCHEMA,
    appId: candidate.appId,
    jobId: candidate.jobId,
    releaseKey: candidate.releaseKey,
    digest,
    generatedAt: now,
    promotedAt: later,
    files: candidate.files.map((file) => ({ path: file.publicPath, sha256: file.sha256 })).sort((a, b) => a.path.localeCompare(b.path)),
    provenance: { generator: "codex/luna", reviewer: candidate.review.actor },
  };
  validatePublicReleaseManifest(manifest);
  validateReleaseCandidateForJob(candidate, jobDefinition);
  validatePublicReleaseForJob(manifest, jobDefinition);
  assert.equal(publicReleaseManifestPath(jobDefinition, candidate.releaseKey), "releases/2026-09-20--ai.json");
  assert.equal(reconcilePublicRelease(undefined, candidate), "create");
  assert.equal(reconcilePublicRelease(manifest, candidate), "already-promoted");
  assert.equal(reconcilePublicRelease(manifest, { ...candidate, digest: "f".repeat(64) }), "conflict");
  assert.throws(() => validatePublicReleaseManifest({ ...manifest, privateSourcePath: "drafts/secret.md" }), /unknown fields/);
  assert.throws(() => validatePublicReleaseManifest({ ...manifest, files: [{ path: "content%2Fsecret.md", sha256: sha256Text("secret") }] }), /safe repository-relative path/);
  assert.throws(() => validateReleaseCandidateForJob({ ...candidate, files: [{ ...candidate.files[0], publicPath: "other/secret.md" }] }, jobDefinition), /does not match|outside/);
});

test("checks scheduler lease expiry", () => {
  const lease = { key: "ai-daily:ai", owner: "runner-1", acquiredAt: now, expiresAt: later, fencingToken: "token-1" };
  assert.equal(isLeaseExpired(lease, "2026-09-20T01:04:59+10:00"), false);
  assert.equal(isLeaseExpired(lease, later), true);
});
