# Personal Repo App

This starter is one self-contained personal application: one repository, one canonical `data/` boundary and one GitHub Pages deployment.

1. Change the id and title in `repo-app.config.ts`.
2. Replace the record schema, canonical data and safe demo fixture together.
3. Implement domain views under `src/` using the shared Repo Apps packages.
4. Run `pnpm install`, commit the resulting `pnpm-lock.yaml`, and run `pnpm check`.
5. Enable GitHub Pages with **GitHub Actions** as its source, then push `main`.

The deployment workflow derives the owner and repository from GitHub Actions metadata. Do not add tokens to `.env`, source, build output, URLs or logs. Local `PUBLIC_REPO_APPS_FAKE=1` is only for a deterministic fake adapter, never production.

Read `AGENTS.md` before asking a coding agent to modify this app.
