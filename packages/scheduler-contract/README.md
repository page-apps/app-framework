# Scheduler Contract

`@repo-apps/scheduler-contract` defines the host-side contract for recurring agent-produced work. It does not schedule processes or run models. Local cron, GitHub Actions, Temporal and future worker hosts implement adapters over the same job, lifecycle and recovery semantics.

The package provides:

- validated scheduler job manifests;
- durable run states and guarded transitions;
- adapter profiles with lease-backed or durable-workflow execution authority;
- deterministic public release and private canonical-output identities;
- private release-candidate and safe public-release schemas; and
- idempotent public-release and private-output reconciliation.

There are two explicit output modes:

- public jobs use the existing private editorial → public publication → build/deployment lifecycle and end at `published`;
- private-canonical jobs declare a private data repository and end at `committed` after `validating → committing`, with no release manifest, public promotion or deployment reconciliation.

Private jobs use `canonicalData.outputKey + digest` for idempotent output reconciliation and keep scheduler state in an explicit private scheduler boundary.

This is a privileged automation package. Do not import it into the public Pages client or place scheduler commands, credentials, private paths, run records or candidate manifests in the Pages artifact.

See [`docs/SCHEDULER.md`](../../docs/SCHEDULER.md) for the normative lifecycle and adapter requirements.
