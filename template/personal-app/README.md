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

Read `AGENTS.md` before asking a coding agent to modify this app.
