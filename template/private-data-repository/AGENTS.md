# Agent guide for a private Repo App data repository

This repository contains canonical private application data and private derived files. It does not contain or deploy the public PWA.

- `data/` is authoritative. Preserve user records and schema versions.
- `schemas/` contains portable contracts.
- `generated/` is deterministic and replaceable; only generation scripts and the workflow should update it.
- Never add GitHub Pages deployment, public artifact upload, repository dispatch containing record data, analytics or external data export.
- Validate remote-shaped content before changing canonical files.
- Keep workflow permissions minimal. The generator may use the repository-scoped `GITHUB_TOKEN` to update `generated/`.
- Avoid generation loops with workflow path filters and by keeping generated output outside `data/`.

Run `node scripts/validate-data.mjs` and `node scripts/generate-index.mjs --check` before handoff.
