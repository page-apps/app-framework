# Personal Repo App

This starter creates one public GitHub Pages application. Its manifest supports either canonical data in the app repository (`self`) or one fixed, separately managed data repository (`fixed`).

1. Change the id and title in `repo-app.config.ts`.
2. Replace the record schema and safe demo fixture. Keep canonical data here only in `self` mode.
3. Implement domain views under `src/` using the shared App Framework packages.
4. Run `pnpm install`, commit the resulting `pnpm-lock.yaml`, and run `pnpm check`.
5. Enable GitHub Pages with **GitHub Actions** as its source, then push `main`.

The deployment workflow derives its own owner and repository from GitHub Actions metadata. Do not add tokens to `.env`, source, build output, URLs or logs. Local `PUBLIC_REPO_APPS_FAKE=1` is only for a deterministic fake adapter, never production.

For private personal data, create a second private repository from `template/private-data-repository` and change the manifest to:

```ts
repository: {
  mode: "fixed",
  owner: "page-apps",
  name: "my-app-data",
  branch: "main",
  dataRoot: "data",
},
dataPipeline: {
  mode: "actions",
  workflow: "validate-data.yml",
  derivedRoot: "generated",
},
```

The public repository's workflow deploys the PWA. The private repository's workflow validates canonical data and generates private derived files. The PWA reads those files at runtime with a session-first, fine-grained PAT; private data never enters the Pages artifact.

For an agent-produced public reader, use a different boundary: keep prompts, research, drafts and review history in a private editorial repository, then promote only the selected public-safe content into this public app repository. The Pages app must render the promoted content statically and must not fetch the private editorial repository at runtime or require a PAT. A private draft is not published until the public repository accepts the release and its Pages workflow completes.

Recommended release flow:

```text
agent host → private drafts → validate/review → public content commit → Pages deploy
```

Make release keys (for example, date plus pipeline id) idempotent, validate the public content independently, and stop on a conflicting existing release. Never copy private prompts, credentials, hidden research notes or unpublished draft text into `content/`, `data/`, generated assets, logs or URLs.

For recurring generation, keep the scheduler job and lifecycle state in the private editorial/scheduler boundary and use `@repo-apps/scheduler-contract`. The host may be local cron, GitHub Actions, Temporal or another worker, but it must use one durable state authority, single-owner execution, bounded retry, release-digest and deployment-reconciliation semantics. See the framework's `docs/SCHEDULER.md`.

Read `AGENTS.md` before asking a coding agent to modify this app.
