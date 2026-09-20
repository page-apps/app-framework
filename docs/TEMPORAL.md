# Temporal Adapter Profile

Status: Normative adapter mapping for scheduler contract v1

Temporal is an execution backend for the host-neutral scheduler contract; it is not part of the public reader and it does not replace the Git publication boundary.

## Identity and scheduling

Use a Temporal Schedule whose Schedule ID is derived from `jobId`. Configure its overlap policy from `job.concurrency.overlap`: `skip` maps to Temporal `Skip`, and `buffer-one` maps to `BufferOne`.

Use the scheduled action time as `scheduledFor` and in the deterministic `occurrenceKey`. Start one Workflow with an ID derived from `jobId + occurrenceKey`. The contract `executionId` is this stable Workflow ID. A Temporal Run ID is a volatile platform attempt identifier: retries, reset and Continue-As-New can change it, so it may be recorded for diagnostics but must never determine occurrence, release or idempotency identity.

For schedules that need intervals, exclusions, jitter, backfill or other Temporal-specific features, set the portable job trigger to `external`. Keep the full Temporal Schedule specification in private adapter configuration and supply the normalized occurrence to the contract. This avoids reducing Temporal's schedule model to five-field cron.

## Workflow and Activity boundary

The Workflow owns the scheduler state machine and uses its Event History as the single lifecycle authority. It may expose `SchedulerRunRecord` as a query, Search Attribute projection or private read model. Do not make workflow progress depend on a second compare-and-swap `SchedulerRunStore`; that creates a dual-write state machine.

Put all non-deterministic or side-effecting work in Activities, including:

- invoking the coding agent or model;
- reading or writing either repository;
- validating files with external tools;
- creating or merging a promotion pull request; and
- observing GitHub workflow and Pages deployment status.

Activities must be idempotent. Repository writes use the release key, digest and expected public branch head from the core contract. Activity retries handle transient step failures; the contract `attempt` increments only when the logical pipeline enters `retry-wait` and starts another pipeline attempt after the Activity policy is exhausted or the workflow explicitly classifies a retryable failure.

Human review maps to a Signal or Update carrying only the decision and safe references. The Workflow waits in `needs-review`, then transitions to `approved`, `failed` or `cancelled`. A long-lived review or unusually large history may use Continue-As-New while preserving the Workflow ID and contract `executionId`.

## Concurrency and publication safety

Use `SchedulerAdapterProfile` as follows:

```ts
const temporalProfile = {
  id: "temporal",
  stateAuthority: "workflow-history",
  executionAuthority: "durable-workflow",
} satisfies SchedulerAdapterProfile;
```

Temporal Workflow ID uniqueness and Schedule overlap policy establish the logical owner, so a separate `SchedulerLeaseProvider` is not required. They do not fence a process outside Temporal and do not make a workflow transition atomic with a Git push. Promotion must still:

1. read and validate the approved candidate at its exact source revision;
2. reconcile `releaseKey + digest`;
3. write against the expected public branch head;
4. treat a matching release as idempotent success and a different digest as conflict; and
5. mark `published` only after deployment reports the promoted commit.

This Git handshake is the final cross-system correctness boundary.

## Data and visibility

Workflow inputs, results, Event History, identifiers, Memos and Search Attributes are operational data, not a private content store. Pass opaque draft/release references and digests through the Workflow. Keep prompts, source notes, draft bodies, credentials and model transcripts in the private editorial store or an encrypted private object store.

Never put private data or secrets in Workflow IDs, Task Queue names, Workflow/Activity type names, Signal names or Search Attributes. If payload bodies must cross Temporal, configure a client-side Payload Codec/encryption strategy and still minimize them. Workers inject repository and model credentials at Activity execution time; credentials are not Workflow arguments.

## Operational mapping

| Scheduler contract | Temporal |
| --- | --- |
| `jobId` | Schedule ID / stable pipeline identity |
| `occurrenceKey` | normalized scheduled action time |
| `executionId` | Workflow ID |
| `attempt` | contract-level pipeline retry, not Temporal Run ID or Activity attempt |
| run lifecycle | Workflow state reconstructed from Event History |
| generation, validation, promotion, observation | idempotent Activities |
| retry delay | Activity Retry Policy and/or durable Workflow timer |
| `needs-review` | Workflow wait plus Signal or Update |
| run-store view | Query/Search Attribute/private projection |
| release reconciliation | idempotent publication Activity with Git expected-head check |

Temporal references: [Schedules](https://docs.temporal.io/schedule), [Workflow ID and Run ID](https://docs.temporal.io/workflow-execution/workflowid-runid), [Activities](https://docs.temporal.io/activities), [Retry Policies](https://docs.temporal.io/encyclopedia/retry-policies), and [Codecs and encryption](https://docs.temporal.io/production-deployment/data-encryption).
