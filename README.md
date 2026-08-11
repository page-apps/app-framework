# Repo Apps Harness

Repo Apps Harness is an opinionated TypeScript and Astro foundation for small personal applications whose canonical data lives in an explicitly owned GitHub repository boundary. The included **Quick Log** reference app demonstrates the complete loop: demo, connect, read, edit, revision-aware commit, build and publish.

The default rule is **one standalone Pages app, one repository, one canonical data boundary and one deployment**. The planned hub topology adds one parent Pages app at the repository root with child apps exactly under `apps/<app-id>/`; the parent composes and links those children without flattening their data or allowing routine parent updates to rewrite them. Shared packages provide credentials, repository access, runtime state, UI and testing helpers; they do not centrally store app data.

## Requirements

- Node.js 24 LTS
- pnpm 11.20.0 (the exact version is declared in `package.json`)
- TypeScript 7.0.2 for project compilation

## Start the reference app

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Astro. Without a credential, Quick Log uses its bundled fixture and labels the experience as read-only demo mode.

Run the complete local quality gate with:

```sh
pnpm check
pnpm test:e2e
```

`pnpm check` type-checks, runs unit tests, validates canonical data and builds every workspace project that exposes the corresponding script. The Playwright test starts Quick Log with a deterministic in-memory repository adapter; it never calls GitHub or persists a real token.

## Repository layout

```text
packages/                 shared framework packages
template/personal-app/    copyable one-repository starter
quick-log/                full reference application
e2e/                      browser-level fake-repository test
docs/                     product and architecture decisions
```

Hub repositories use this additional layout convention:

```text
hub-repository/
├── src/                   parent hub app
├── data/                  parent-owned data
└── apps/
    ├── quick-log/         child app boundary
    └── reading-tracker/   child app boundary
```

The root app owns root paths. Parent maintenance scripts and agents exclude `apps/**` unless a child is explicitly named.

GitHub only discovers Actions workflows from `.github/workflows` at the root of
the repository it is running. This workspace therefore keeps repository-visible
CI and Quick Log Pages deployment workflows in the root `.github/workflows/`
directory. The matching workflows under `quick-log/.github/` and
`template/personal-app/.github/` are intentionally dormant here: they become the
root workflows when Quick Log or the starter is extracted into its own app
repository, as required by the standalone-app production model.

The root Pages workflow is immediately visible in the repository's **Actions**
tab. Enable **Settings → Pages → Source → GitHub Actions** before the first
deployment. PAT connection requires no build secret. To enable Device Flow, add
the public OAuth App client ID as the repository variable
`REPO_APPS_GITHUB_CLIENT_ID`; the workflow exposes it to the static build as
`PUBLIC_GITHUB_DEVICE_CLIENT_ID`. Never store a client secret in this project.

## Create a personal app

Copy `template/personal-app` into a new repository, replace the example collection and fixture, and update the manifest title and id. Keep canonical content under `data/`, demo-only content under `demo/`, and schemas under `schemas/`. The app workflow derives `owner/repository` from trusted `GITHUB_REPOSITORY` metadata; do not hard-code a repository identity or put a credential in source, build variables or Pages output.

Application features receive a repository capability from the shared runtime. They must not parse tokens or call GitHub endpoints directly. Normal writes are confined to the configured self repository and include the expected revision so stale updates become visible conflicts.

See [the PRD](docs/PRD.md) and [ADR-001](docs/ADR-001.md) for the complete contract, limitations and accepted personal-use security model.

## Security boundary

This is a personal-use static architecture, not a strong browser security boundary. Browser-held credentials can be exposed by XSS, compromised dependencies or another app on the same origin. Use a fine-grained, expiring token limited to the minimum repositories and `Contents: read and write`; never use this design for sensitive multi-user applications.
