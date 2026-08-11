# Agent guide for a personal Repo App

This repository is one complete personal application. Preserve the invariant: **one Pages app, one GitHub repository, one canonical data boundary and one deployment**.

## Repository ownership

- `data/` is canonical, user-owned application data. Treat it as authoritative.
- `demo/` contains public, bundled fixtures only. It must not contain a privileged credential or private canonical content.
- `schemas/` contains versioned contracts for every writable collection.
- `src/` contains app-specific views and domain behaviour.
- `repo-app.config.ts` declares the self-repository boundary, data root, authentication choices and conflict policy.
- `dist/`, generated indexes, caches and Pages artifacts are derived. Never treat them as canonical or commit them unless a documented app-specific process requires it.
- `.github/workflows/deploy.yml` validates source data and regenerates the site. The app repository owns this workflow.

The normal repository capability is `mode: "self"`. Owner and repository are derived from trusted GitHub Actions metadata at build time. Do not hard-code another repository or implement cross-repository access. Any future extra repository capability requires an explicit architecture decision and user-visible permission explanation.

## Safe extension points

Agents may add or change domain components, views, fixtures, collection schemas, app-specific validation, tests and pre-build generation. Keep application code behind the shared `@repo-apps/*` interfaces.

Do not casually modify credential storage, token redaction, core GitHub requests, conflict semantics, runtime transitions, the standard security disclosure or deployment metadata contract. Those are framework concerns. Do not let a feature module read a raw token, parse framework credential storage or call GitHub endpoints directly; request the shared repository capability instead.

## Changing a collection

When adding or changing writable content:

1. Add or version its schema under `schemas/`.
2. Update canonical data under `data/` without discarding user records.
3. Update the safe fixture under `demo/` independently; do not copy sensitive data into it.
4. Validate after remote reads and before every commit.
5. Retain the current blob revision and include it on update. A stale revision must enter the conflict flow, never silently overwrite remote state.
6. Add validator and behavioural tests. Document schema migrations explicitly.

Keep writes user-initiated or deliberately batched. Never commit on each keystroke. Normal updates go only to the configured branch and self repository.

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

The user edits locally, the app validates, and the shared client commits with an expected revision. A commit is only **Committed**. GitHub Actions then validates and builds, and Pages eventually becomes **Published**. Preserve those distinct states and show actionable failure or conflict information between them.

## Security disclosure

Before persistent credential storage is enabled, the app must display the framework's immutable standard disclosure. Browser-held tokens are exposed to XSS, compromised dependencies and malicious same-origin code. `localStorage` is origin-scoped, not path-scoped; cookie paths are not a confidentiality boundary. Recommend a fine-grained, expiring PAT limited to the minimum app repositories and `Contents: read and write`. Never commit, log, embed, put in a URL or send a credential to analytics.
