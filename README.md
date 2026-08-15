# Repo Apps Harness

Repo Apps Harness is an opinionated TypeScript and Astro foundation for small personal applications whose canonical data lives in an explicitly owned GitHub repository boundary. The included **Quick Log** reference app demonstrates the self-repository loop: demo, connect, read, edit, revision-aware commit, build and publish. The framework also supports a public Pages shell whose canonical data lives in one fixed private repository.

The default rule is **one standalone Pages app, one explicit canonical data repository and one explicit deployment repository**. They may be the same (`self`) or the app may target one manifest-declared repository (`fixed`). For private personal data, the recommended topology is a public app repository plus a separate private data repository. The planned hub topology adds one parent Pages app at the repository root with child apps exactly under `apps/<app-id>/`; the parent composes and links those children without flattening their boundaries.

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
template/personal-app/    copyable public Pages/PWA starter
template/private-data-repository/  copyable private data and Actions starter
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

For a public shell with private data, use two repositories and two pipelines:

```text
public app push   → test → build PWA → deploy Pages
private data push → validate → generate private indexes → data ready
```

The PWA reads private canonical and generated files at runtime with the user's PAT. Private data is never copied into the public Pages artifact. Live data-workflow status is optional and requires `Actions: read`; normal reads and saves require only `Contents: read and write`.

GitHub only discovers Actions workflows from `.github/workflows` at the root of
the repository it is running. This workspace therefore keeps repository-visible
CI and Quick Log Pages deployment workflows in the root `.github/workflows/`
directory. The matching workflows under `quick-log/.github/` and
`template/personal-app/.github/` are intentionally dormant here: they become the
root workflows when Quick Log or the starter is extracted into its own app
repository, as required by the standalone-app production model.

The root Pages workflow is immediately visible in the repository's **Actions**
tab. Enable **Settings → Pages → Source → GitHub Actions** before the first
deployment. PAT connection requires no build secret. Browser Device Flow is not
supported: GitHub's login/token endpoints do not provide the CORS contract a
static Pages app needs. Never store a PAT, OAuth client secret or other
credential in source, Actions build configuration or Pages output.

## Create a personal app

Copy `template/personal-app` into a new repository, replace the example collection and fixture, and update the manifest title and id. Keep demo-only content under `demo/` and schemas under `schemas/`. In `self` mode, canonical content remains under the declared `dataRoot` in the app repository. In `fixed` mode, declare one owner/repository in the manifest and keep canonical private content only in that repository; never import it into the Pages build.

Application features receive a repository capability from the shared runtime. They must not parse tokens or call GitHub endpoints directly. Normal writes are confined to the configured data repository and include the expected revision so stale updates become visible conflicts. The runtime separately identifies the deployment repository so a fixed-data commit is not mistaken for a pending Pages publication.

See [the pattern catalogue](docs/PATTERNS.md), [the PRD](docs/PRD.md), [ADR-001](docs/ADR-001.md) and [ADR-002](docs/ADR-002.md) for the complete contract, limitations and accepted personal-use security model. The pattern catalogue also covers public Astro sites with authenticated workspace routes and the local overlay used to hide Actions/Pages latency without misreporting a draft as committed.

## Security boundary

This is a personal-use static architecture, not a strong browser security boundary. Browser-held credentials and locally cached private data can be exposed by XSS, compromised dependencies, browser extensions or another app on the same origin. Session-only storage is the default. Use a fine-grained, expiring token limited to the displayed data repository and `Contents: read and write`; never use this design for sensitive multi-user applications.
