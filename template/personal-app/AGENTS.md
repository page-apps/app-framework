# Agent guide for a personal Repo App

This repository is one complete Pages application. Preserve the invariant: **one explicit deployment repository and one explicit canonical data repository**. They may be the same (`self`) or the manifest may declare one fixed data repository (`fixed`).

## Repository ownership

- `data/` is canonical only in `self` mode. In `fixed` mode it must contain no private canonical records.
- `demo/` contains public, bundled fixtures only. It must not contain a privileged credential or private canonical content.
- `schemas/` contains versioned contracts for every writable collection.
- `src/` contains app-specific views and domain behaviour.
- `repo-app.config.ts` declares the data-repository boundary, optional data workflow, authentication choices and conflict policy.
- `dist/`, generated indexes, caches and Pages artifacts are derived. Never treat them as canonical or commit them unless a documented app-specific process requires it.
- `.github/workflows/deploy.yml` validates source data and regenerates the site. The app repository owns this workflow.

If this app is an agent-produced public reader, the public repository is the publication boundary. Private editorial drafts, prompts, source notes and agent state belong in a separate private repository and must never be fetched by the anonymous reader or copied into the Pages artifact. Promotion must select an explicit release set, validate it independently and stop on a conflicting release key. A private editorial commit is not a public publication.

Recurring producers must follow `@repo-apps/scheduler-contract`: one durable private execution per deterministic occurrence, one state authority, lease-backed or durable-workflow ownership, bounded classified retries, an approved private release candidate, a sanitized public release manifest, expected-head promotion and deployment reconciliation against the promoted commit. Scheduler commands, run records and credentials do not belong in `repo-app.config.ts` or the Pages build.

For migration work, use `docs/SCHEDULER_ADOPTION.md` from the framework. Public readers use `.scheduler/jobs/<job-id>.ts` and `scheduler/runs/<execution-id>.json` in the private editorial/scheduler boundary; private canonical-data jobs use the explicit `private-canonical` output mode and end at `committed`, never `published`. A durable-workflow adapter keeps history as the sole authority.

In `self` mode, owner and repository are derived from trusted GitHub Actions metadata at build time. In `fixed` mode, the manifest declares exactly one owner/repository; this public, token-free target must not be overridden by a URL, arbitrary user input or browser storage. Do not introduce additional repository capabilities without an explicit architecture decision and user-visible permission explanation.

## Safe extension points

Agents may add or change domain components, views, fixtures, collection schemas, app-specific validation, tests and pre-build generation. Keep application code behind the shared `@repo-apps/*` interfaces.

Do not casually modify credential storage, token redaction, core GitHub requests, conflict semantics, runtime transitions, the standard security disclosure or deployment metadata contract. Those are framework concerns. Do not let a feature module read a raw token, parse framework credential storage or call GitHub endpoints directly; request the shared repository capability instead.

## Changing a collection

When adding or changing writable content:

1. Add or version its schema under `schemas/`.
2. In `self` mode, update canonical data under `data/` without discarding user records. In `fixed` mode, make canonical changes only in the declared private data repository.
3. Update the safe fixture under `demo/` independently; do not copy sensitive data into it.
4. Validate after remote reads and before every commit.
5. Retain the current blob revision and include it on update. A stale revision must enter the conflict flow, never silently overwrite remote state.
6. Add validator and behavioural tests. Document schema migrations explicitly.

Keep writes user-initiated or deliberately batched. Never commit on each keystroke. Normal updates go only to the configured branch and data repository.

## Required checks

Run before handoff:

```sh
pnpm typecheck
pnpm test
pnpm validate:data
pnpm build
```

Keep `pnpm-lock.yaml` committed. The Pages workflow installs with `--frozen-lockfile` and must pass all four stages before deployment.

## Release loop

The user edits locally, the app validates, and the shared client commits with an expected revision. In `self` mode, preserve **Committed → Building → Published**. In fixed mode, the private workflow uses **Committed → Validating → Data ready**, while source changes in this repository independently deploy the PWA. Never describe a private data commit as a pending Pages publication.

## Security disclosure

Before persistent credential storage is enabled, the app must display the framework's immutable standard disclosure. Browser-held tokens and private local caches are exposed to XSS, compromised dependencies, browser extensions and malicious same-origin code. Session storage is the default. Recommend a fine-grained, expiring PAT limited to the displayed data repository and `Contents: read and write`; data-workflow tracking may additionally request `Actions: read`. Never commit, log, embed, put in a URL or send a credential to analytics. Service workers must not cache authenticated GitHub API traffic.
