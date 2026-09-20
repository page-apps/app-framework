# Scheduler Contract

`@repo-apps/scheduler-contract` defines the host-side contract for recurring agent-produced public readers. It does not schedule processes or run models. Local cron, GitHub Actions, Temporal and future worker hosts implement adapters over the same job, lifecycle and release semantics.

The package provides:

- validated scheduler job manifests;
- durable run states and guarded transitions;
- adapter profiles with lease-backed or durable-workflow execution authority;
- deterministic public release digests;
- private release-candidate and safe public-release schemas; and
- idempotent public-release reconciliation.

This is a privileged automation package. Do not import it into the public Pages client or place scheduler commands, credentials, private paths, run records or candidate manifests in the Pages artifact.

See [`docs/SCHEDULER.md`](../../docs/SCHEDULER.md) for the normative lifecycle and adapter requirements.
