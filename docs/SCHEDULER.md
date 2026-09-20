# Agent-Produced Reader Scheduler Contract

Status: Normative v1 contract

This contract defines how an external scheduler drives the agent-produced public-reader pattern. It is intentionally independent of cron, GitHub Actions and any particular model provider.

## Boundary

```text
private scheduler host
  trigger + execution authority + secrets
           │
           ▼
private editorial repository
  draft + validation + review + private run record
           │ approved release candidate
           ▼
public reader repository
  selected public files + safe release manifest
           │ exact promoted commit
           ▼
public workflow + Pages deployment
           │
           ▼
anonymous reader
```

The scheduler is privileged automation and never executes in the public Pages app. The public app manifest must not contain scheduler commands, private checkout paths, tokens, model credentials or private run state.

The framework contract owns identities, lifecycle semantics, release integrity and recovery. The app owns generation, domain validation, editorial policy and model selection. The host owns triggering, direct process spawning, secret injection and one durable lifecycle authority. A simple host uses a compare-and-swap run store plus a lease; a durable workflow engine may use workflow history and workflow identity instead.

## Identities

Keep these values distinct:

| Identity | Meaning | Example |
| --- | --- | --- |
| `jobId` | Stable configured output pipeline | `ai-daily:ai` |
| `occurrenceKey` | Deterministic scheduled slot | `2026-09-20T01:00:00+10:00` |
| `executionId` | Stable logical execution of the occurrence | deterministic id or Temporal Workflow ID |
| `attempt` | Retry number inside the same run | `1`, then `2` |
| `releaseKey` | Public idempotency/content slot | `2026-09-20--ai` |
| `digest` | SHA-256 identity of sorted public paths and file hashes | 64 lowercase hex characters |
| `commitSha` | Public promotion result | Git commit SHA |
| deployment identity | Workflow/Pages observation for that commit | host/API-specific id |

One scheduler job owns one independently retryable output pipeline. If an app publishes two daily pipelines, define two jobs even when the host triggers them at the same time. This prevents one failed pipeline from making the other pipeline's occurrence ambiguous.

## Job manifest

Store the scheduler job manifest in the private editorial or scheduler repository. A typical job is:

```ts
import { defineSchedulerJob, SCHEDULER_JOB_SCHEMA } from "@repo-apps/scheduler-contract";

export default defineSchedulerJob({
  schema: SCHEDULER_JOB_SCHEMA,
  id: "daily-brief:main",
  appId: "daily-brief",
  enabled: true,
  trigger: {
    kind: "cron",
    expression: "0 1 * * 1-5",
    timeZone: "Australia/Sydney",
    misfire: "run-latest",
  },
  pipeline: {
    id: "main",
    command: "pnpm",
    args: ["scheduler:run", "--", "--pipeline=main"],
  },
  editorial: {
    repository: { owner: "example", name: "daily-brief-editorial", branch: "main" },
    draftRoot: "drafts",
    runRoot: "scheduler/runs",
  },
  publication: {
    repository: { owner: "example", name: "daily-brief", branch: "main" },
    contentRoot: "content",
    releaseManifestRoot: "releases",
    mode: "direct",
  },
  review: { mode: "automatic-or-human" },
  concurrency: { overlap: "skip" },
  retry: {
    maxAttempts: 3,
    strategy: "exponential",
    baseDelaySeconds: 60,
    maxDelaySeconds: 900,
  },
});
```

Hosts must spawn `pipeline.command` with its argument array directly. Do not interpolate the manifest through a shell. Secret references and values belong to the host configuration, not this portable job manifest.

A cron trigger records intent; its expression is interpreted by the host adapter. An external trigger requires the host to supply `occurrenceKey` and `scheduledFor`. For a missed cron occurrence, `skip` records no late run and `run-latest` runs only the newest missed slot. Never backfill an unbounded series implicitly.

## Run lifecycle

The private durable run state is:

```text
queued → claimed → generating → validating
                                  ├─→ needs-review → approved
                                  └─→ approved
approved → promoting → promoted → building → published
```

Permitted failure paths are:

```text
claimed / generating / validating / promoting / building
  → retry-wait → claimed

queued → skipped
promoting → conflicted
any active state → failed or cancelled
```

Retries retain `executionId` and increment `attempt`. An adapter's internal task or Activity retries do not increment this value; `attempt` counts retries of the logical pipeline after a contract-level failure. Terminal `published`, `failed`, `conflicted`, `skipped` and `cancelled` runs never transition again. A corrected manual-review item may move from `needs-review` to `approved`; it is not an automatic retry.

The run store is private. Records may contain ids, revisions, sanitized error summaries and public deployment links. They must not contain prompts, draft bodies, source notes, tokens, environment values or model transcripts.

In store-backed mode, `SchedulerRunStore` is the state authority. It uses opaque revisions and compare-and-swap saves. It enforces uniqueness for `jobId + occurrenceKey`; `create` must fail rather than replace an existing occurrence, and the adapter then loads and resumes that run. Every transition supplies the last `expectedRevision`, so concurrent or stale transitions are visible conflicts rather than last-writer-wins updates. The store may be a private repository file, local durable database or hosted store, but its revision guarantees must be equivalent.

In durable-workflow mode, workflow history is the state authority and must make the same lifecycle reconstructible. A run-store record may be emitted as a query/read model, but it is a projection, not a second authority. The adapter must not coordinate workflow progress with dual writes to Temporal and a run store.

## Execution authority and concurrency

The portable manifest declares an overlap policy for each `jobId`. Each adapter must establish one execution authority before changing private or public repository state:

- A lease-backed adapter atomically acquires a renewable lease and retains its fencing token through every mutating step. A stale or expired lease must not publish.
- A durable-workflow adapter uses a deterministic workflow identity, workflow-id conflict policy and scheduler overlap policy to establish one logical owner. Its workflow history is the durable lifecycle authority.

Adapter mappings:

- Local cron uses an OS-level lock such as `flock` keyed by `jobId` around the complete run and persists a unique fencing token in its private state.
- GitHub Actions uses `concurrency.group` with `cancel-in-progress: false` and retains the run-attempt identity as a fencing token.
- A hosted worker may implement `SchedulerLeaseProvider` with atomic acquire, renew and release operations.
- Temporal uses a deterministic Workflow ID derived from `jobId + occurrenceKey`; the contract `executionId` maps to that Workflow ID, never to Temporal's mutable Run ID. See [the Temporal adapter profile](TEMPORAL.md).

These mechanisms prevent ordinary overlap but cannot fence a non-cooperating publisher or make Git and the orchestration backend transactional. The expected public branch head and release reconciliation remain the final correctness boundary.

## Release records

The private producer emits `ReleaseCandidate`. It contains the source draft id/revision, approved review, private source-to-public path map, per-file SHA-256 hashes and aggregate digest. It stays private.

The public repository receives only the selected files and `PublicReleaseManifest`. The public manifest includes public paths, per-file hashes, aggregate digest, timestamps and safe generator/reviewer labels. It excludes private repository paths, source revisions, prompts, raw research and run errors.

The aggregate digest is SHA-256 over public files sorted by path, using this canonical input for every file:

```text
<public path> NUL <lowercase file sha256> LF
```

The package supplies `sha256Text()`, `computeReleaseDigest()`, candidate/public validators and `reconcilePublicRelease()`.

## Promotion handshake

Every publisher must perform these steps:

1. Establish and verify the job's execution authority.
2. Read the private candidate at its exact source revision.
3. Validate the candidate and independently compute its file hashes and aggregate digest.
4. Read the current public branch head and the release manifest for `releaseKey`.
5. If the key exists with the same digest, record idempotent `promoted` success.
6. If the key exists with a different digest, stop as `conflicted`; never overwrite silently.
7. Otherwise commit exactly the allowlisted public files and safe manifest using the expected public branch head.
8. Record the resulting public commit SHA in the private run.
9. Observe the public workflow and Pages deployment for that exact commit.
10. Mark `published` only when the successful deployment commit equals the promoted commit.

Promotion by pull request follows the same release-key and digest rules. `promoted` occurs only after merge and records the merged public commit.

If public promotion succeeds and private close-out fails, the next attempt reads the public release manifest. A matching digest repairs the private run as already promoted; another digest becomes a conflict. The publisher must not create a duplicate release.

## Retry classification

Automatically retry only transient failures:

- network timeouts and temporary DNS failures;
- GitHub rate limits and retryable server failures;
- temporary model or source quota exhaustion; and
- workflow/Pages observation failures where the promoted commit is still known.

Do not automatically retry:

- invalid or unsafe draft/release content;
- rejected or human-review-required content;
- permission or credential-scope failures;
- unsafe or duplicate paths;
- a conflicting release digest; or
- exhausted attempts.

The adapter calculates bounded fixed or exponential delays from the manifest. Provider retry timestamps may extend, but never shorten, the calculated delay. Durable workflow engines may implement the delay with durable timers and individual step retries with Activities, but must preserve the contract-level attempt limit and failure classification. App checkpoints may resume completed generation or review steps, but checkpoint contents remain private and are keyed by `executionId`, `jobId` and step.

## Credential boundaries

Prefer separate capabilities:

| Capability | Minimum scope |
| --- | --- |
| Generator | Read sources; write private editorial repository |
| Reviewer | Read candidate; no public write by default |
| Publisher | Read approved candidate; expected-head write to public repository |
| Public build | Read public repository; deploy Pages |
| Browser reviewer | Explicit session credential for the repositories required by that UI |

Model/source credentials and repository tokens come from the host secret store or environment. Never persist them in job manifests, run records, Git commits, command arguments, logs, URLs or Pages assets.

## Adapter requirements

A conforming adapter must:

- derive one deterministic occurrence per scheduled slot;
- create or resume one logical run for that occurrence;
- declare a `SchedulerAdapterProfile` and establish either lease-backed or durable-workflow execution authority;
- spawn the app runner without shell interpolation;
- persist every accepted state transition durably and privately in exactly one state authority;
- implement bounded retry classification and attempts;
- perform expected-head publication and digest reconciliation;
- sanitize logs and run errors; and
- reconcile deployment status against the exact promoted commit.

The adapter may report completion, meaningful failure or required user action to an external monitor. It should remain quiet when no occurrence is due and when monitored state is unchanged.

## Out of scope

The v1 contract does not provide a hosted scheduler, database, general DAG engine, cross-job resource locking, model orchestration, prompt format, editorial schema, automatic human-review policy or migration layer for pre-contract scripts. Those remain host- or application-specific. Temporal is a supported adapter profile, not a required framework dependency.
