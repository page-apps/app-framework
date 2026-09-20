# Private Repo App Data

This starter is the private half of a public-shell/private-data Repo App. Keep the repository private and pair it with exactly one public Pages app manifest using `repository.mode: "fixed"`.

- `data/records.json` is canonical.
- `schemas/records.schema.json` documents the portable data contract.
- `generated/index.json` is deterministic and replaceable.
- `.github/workflows/validate-data.yml` validates canonical files and refreshes generated files after a PAT-authenticated commit.

The public app reads both `data/` and `generated/` at runtime through `api.github.com` with a fine-grained PAT. Never publish this repository with GitHub Pages, upload its records as a public artifact or send private content in a repository-dispatch payload.

Create a fine-grained PAT for only this repository with `Contents: read and write`. Add `Actions: read` only if the PWA displays live validation status.

Replace the example record contract, validator and generator together before use.

This template is for authenticated private data, not for an anonymous public content reader. If an agent generates content that everyone should see, use the agent-produced public-reader pattern: keep drafts here or in another private editorial repository, then promote public-safe releases into the public reader repository before Pages deployment.
