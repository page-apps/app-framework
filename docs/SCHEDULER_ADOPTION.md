# Scheduler Adoption Guide

Status: Adoption checklist for scheduler contract v1

Use this guide when bringing an existing app, data repository or editorial
repository into the scheduling pattern. The scheduler is host-side automation;
it is never part of `repo-app.config.ts`, the public Pages build or the browser.

## Locations are part of the boundary

For an agent-produced public reader, use one private editorial/scheduler
repository and one public reader repository:

```text
private-editorial-repository/
├── .scheduler/
│   └── jobs/
│       └── <job-id>.ts              # SchedulerJobManifest
├── drafts/                          # private source and review material
├── releases/
│   └── candidates/                  # private ReleaseCandidate records
└── scheduler/
    └── runs/
        └── <execution-id>.json      # only for a run-store adapter

public-reader-repository/
├── content/                         # selected public files only
├── releases/
│   └── <release-key>.json           # PublicReleaseManifest
└── .github/workflows/deploy.yml     # validates, builds and deploys Pages
```

The manifest's `editorial.runRoot` must point to the private run directory,
normally `scheduler/runs`. The manifest's `editorial.draftRoot` is normally
`drafts`; `publication.contentRoot` is normally `content`; and
`publication.releaseManifestRoot` is normally `releases`. Keep these roots
distinct and validate them with `defineSchedulerJob`.

There are two valid durable-state choices:

- With `stateAuthority: "run-store"`, the adapter stores one validated
  `SchedulerRunRecord` per logical execution below the private repository's
  `runRoot`, using compare-and-swap revisions. These files are private
  operational state, not public release content.
- With `stateAuthority: "workflow-history"` (for example Temporal), workflow
  history is the only lifecycle authority. Do not also write an authoritative
  run JSON file; an optional `scheduler/runs/` projection is read-only and may
  be rebuilt.

The job manifest is private configuration. It may be kept in another private
scheduler repository if the host cannot check configuration into the editorial
repository, but the same `.scheduler/jobs/<job-id>.ts` and
`scheduler/runs/` convention should be used there. The host must load one
manifest, create or resume one run for each `jobId + occurrenceKey`, and spawn
the declared command with its argument array.

## Fixed-private-data producer: compatibility check

A fixed-private-data app has this shape:

```text
public-app-repository/
├── repo-app.config.ts                # repository.mode: "fixed"
└── src/                              # public shell; no private records

private-data-repository/
├── data/                             # canonical private records
├── generated/                        # replaceable private indexes
└── .github/workflows/validate-data.yml
```

This pattern is supported by the `private-canonical` scheduler output mode.
Do not add a public release manifest or Pages deployment reconciliation: those
are public-reader semantics. The private job manifest belongs in the private
scheduler boundary and declares `output.kind: "private-canonical"` plus an
explicit `scheduler` boundary:

```text
private-data-repository/
├── .scheduler/jobs/<job-id>.ts
├── .scheduler/runs/                 # run-store mode only
├── data/                            # output.canonicalRoot
└── generated/                       # output.generatedRoot, if used
```

The private lifecycle is `queued → claimed → generating → validating →
committing → committed`, with optional review before `committing`. A run
records `canonicalData.outputKey`, its digest and the resulting private commit
SHA. Same output key and digest is idempotent; a different digest is a
conflict. `committed` does not mean `published` and never requires a public
release manifest or deployment observation.

Keep the existing private-data schema validation and workflow-specific
generation rules. The scheduler contract owns only the recurring occurrence,
durable run state, execution authority, bounded retries, private output
identity and expected-head private commit; it does not replace the app's
canonical-data validator.

## Agent-produced public reader: adoption checklist

Apply this checklist to an existing editorial/public-reader pair:

- [ ] Keep the manifest at `.scheduler/jobs/<job-id>.ts` in the private
  editorial or private scheduler repository. It imports
  `@repo-apps/scheduler-contract` and has one independently retryable pipeline
  per `jobId`.
- [ ] Set `editorial.repository` to the private editorial repository and
  `editorial.runRoot` to `scheduler/runs`.
- [ ] Keep prompts, research, drafts, source notes, review evidence and
  `ReleaseCandidate` records under private roots such as `drafts/` and
  `releases/candidates/`.
- [ ] Store durable runs in `scheduler/runs/<execution-id>.json` only when
  using a run-store adapter. Use CAS revisions, preserve `executionId` across
  retries and increment only `attempt`.
- [ ] For Temporal or another durable workflow adapter, keep workflow history
  as the sole authority and do not dual-write run state.
- [ ] Set `publication.repository` to the separate public reader repository;
  use `content/` and `releases/` as its publication roots.
- [ ] Promote only the allowlisted public files and a sanitized
  `releases/<release-key>.json`. Never copy private source paths, prompts,
  credentials, draft bodies or run errors.
- [ ] Make promotion expected-head safe and reconcile an existing release by
  `releaseKey + digest`. Same digest is idempotent; a different digest is a
  conflict.
- [ ] Mark a run `published` only after the public workflow and Pages
  deployment report the exact promoted commit.
- [ ] Keep the public app token-free and unable to fetch the private editorial
  repository at runtime.

The public reader's `repo-app.config.ts` may describe its public/deployment
boundary, but it must not contain scheduler commands, private repository
paths, credentials, run records or release candidates.

## Existing-repository migration sequence

1. Classify the repository pair. If output remains private, follow the fixed-
   private-data compatibility check and record the v1 limitation. If output is
   anonymous/public, use the agent-produced reader checklist.
2. Identify the single durable state authority. Choose a private CAS run store
   or durable workflow history; do not coordinate two authorities.
3. Move schedule configuration out of public app manifests and Pages
   workflows into `.scheduler/jobs/` in the private boundary.
4. Assign stable `jobId`, deterministic `occurrenceKey`, logical
   `executionId`, bounded `attempt` and idempotent `releaseKey` values.
5. Add the contract package to the private host/adapter, validate manifests and
   run records, and use direct process spawning.
6. Separate private generation/review from public promotion. Test retry,
   duplicate occurrence, conflicting release, stale branch head and failed
   deployment recovery before enabling the schedule.
7. Remove old scheduler state only after the new adapter has reconciled active
   occurrences. Preserve private audit history; never migrate secrets or raw
   model transcripts into run records.

Run the framework's scheduler unit test after contract changes:

```sh
pnpm --filter @repo-apps/scheduler-contract build
pnpm --filter @repo-apps/scheduler-contract test
```

See [SCHEDULER.md](SCHEDULER.md) for the normative contract, [TEMPORAL.md](TEMPORAL.md)
for workflow-history mapping, and [PATTERNS.md](PATTERNS.md) for the repository
topologies.
