export const SCHEDULER_JOB_SCHEMA = "repo-apps/scheduler-job/v1" as const;
export const SCHEDULER_RUN_SCHEMA = "repo-apps/scheduler-run/v1" as const;
export const RELEASE_CANDIDATE_SCHEMA = "repo-apps/release-candidate/v1" as const;
export const PUBLIC_RELEASE_SCHEMA = "repo-apps/public-release/v1" as const;

export type SchedulerOutputKind = "public-release" | "private-canonical";

export interface SchedulerRepositoryTarget {
  readonly owner: string;
  readonly name: string;
  readonly branch: string;
}

export type SchedulerTrigger = {
  readonly kind: "cron";
  /** Five-field cron expression. The host adapter owns execution semantics. */
  readonly expression: string;
  readonly timeZone: string;
  readonly misfire: "skip" | "run-latest";
} | {
  /** The host supplies occurrenceKey and scheduledFor explicitly. */
  readonly kind: "external";
};

interface SchedulerJobManifestBase {
  readonly schema: typeof SCHEDULER_JOB_SCHEMA;
  readonly id: string;
  readonly appId: string;
  readonly enabled: boolean;
  readonly trigger: SchedulerTrigger;
  /** One job owns one independently retryable output pipeline. */
  readonly pipeline: {
    readonly id: string;
    /** Spawn directly with argv; hosts must not evaluate this through a shell. */
    readonly command: string;
    readonly args?: readonly string[];
  };
  readonly review: {
    readonly mode: "none" | "human" | "automatic" | "automatic-or-human";
  };
  readonly concurrency: {
    /** Portable overlap intent. Adapters enforce it with a lease or durable workflow ownership. */
    readonly overlap: "skip" | "buffer-one";
  };
  readonly retry: {
    readonly maxAttempts: number;
    readonly strategy: "fixed" | "exponential";
    readonly baseDelaySeconds: number;
    readonly maxDelaySeconds: number;
  };
}

export interface SchedulerPublicJobManifest extends SchedulerJobManifestBase {
  readonly editorial: {
    readonly repository: SchedulerRepositoryTarget;
    readonly draftRoot: string;
    readonly runRoot: string;
  };
  readonly publication: {
    readonly repository: SchedulerRepositoryTarget;
    readonly contentRoot: string;
    readonly releaseManifestRoot: string;
    readonly mode: "direct" | "pull-request";
  };
  /** Public jobs are the v1 default; private jobs must declare `output`. */
  readonly output?: never;
  readonly scheduler?: never;
}

export interface SchedulerPrivateCanonicalJobManifest extends SchedulerJobManifestBase {
  /** A private output is committed to a private canonical-data repository only. */
  readonly output: {
    readonly kind: "private-canonical";
    readonly repository: SchedulerRepositoryTarget;
    readonly canonicalRoot: string;
    readonly generatedRoot?: string;
  };
  /** The private scheduler/run-store boundary. It may be separate from the data repository. */
  readonly scheduler: {
    readonly repository: SchedulerRepositoryTarget;
    readonly runRoot: string;
  };
  readonly editorial?: never;
  readonly publication?: never;
}

export type SchedulerJobManifest = SchedulerPublicJobManifest | SchedulerPrivateCanonicalJobManifest;

export const SCHEDULER_RUN_STATES = [
  "queued",
  "claimed",
  "generating",
  "validating",
  "needs-review",
  "approved",
  "committing",
  "committed",
  "promoting",
  "promoted",
  "building",
  "published",
  "retry-wait",
  "failed",
  "conflicted",
  "skipped",
  "cancelled",
] as const;

export type SchedulerRunState = (typeof SCHEDULER_RUN_STATES)[number];
export type SchedulerFailureClassification = "retryable" | "permanent" | "conflict" | "manual";

export interface SchedulerCandidateReference {
  readonly releaseKey: string;
  readonly digest: string;
  readonly draftId: string;
  readonly sourceRevision: string;
}

export interface SchedulerReviewRecord {
  readonly status: "needs-review" | "approved";
  readonly checkedAt: string;
  readonly actor?: string;
}

export interface SchedulerPublicationRecord {
  readonly releaseKey: string;
  readonly digest: string;
  readonly manifestPath: string;
  readonly commitSha: string;
  readonly commitUrl?: string;
}

export interface SchedulerDeploymentRecord {
  /** Must equal publication.commitSha before the run may become published. */
  readonly commitSha: string;
  readonly observedAt: string;
  readonly workflowRunId?: string;
  readonly deploymentId?: string;
  readonly url?: string;
}

export interface SchedulerFailure {
  readonly classification: SchedulerFailureClassification;
  readonly code: string;
  /** Sanitized summary only: no prompts, content bodies, tokens or model transcripts. */
  readonly message: string;
}

export interface SchedulerRunRecord {
  readonly schema: typeof SCHEDULER_RUN_SCHEMA;
  /** Stable logical execution identity. Maps to a Temporal Workflow ID, never a Temporal Run ID. */
  readonly executionId: string;
  readonly jobId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: string;
  readonly attempt: number;
  /** Omitted on legacy records, where the public-release lifecycle is implied. */
  readonly outputKind?: SchedulerOutputKind;
  readonly state: SchedulerRunState;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly candidate?: SchedulerCandidateReference;
  readonly review?: SchedulerReviewRecord;
  readonly publication?: SchedulerPublicationRecord;
  readonly deployment?: SchedulerDeploymentRecord;
  /** Private canonical output identity and resulting commit. */
  readonly canonicalData?: SchedulerCanonicalDataRecord;
  readonly failure?: SchedulerFailure;
  readonly nextAttemptAt?: string;
}

export interface SchedulerCanonicalDataRecord {
  readonly outputKey: string;
  readonly digest: string;
  readonly commitSha: string;
  readonly commitUrl?: string;
}

export interface SchedulerCanonicalDataFile {
  readonly path: string;
  readonly sha256: string;
}

export interface SchedulerRunSnapshot {
  readonly run: SchedulerRunRecord;
  /** Opaque store revision used for compare-and-swap updates. */
  readonly revision: string;
}

export interface SchedulerRunStore {
  /** Must fail rather than overwrite an existing jobId + occurrenceKey. */
  create(run: SchedulerRunRecord): Promise<SchedulerRunSnapshot>;
  load(executionId: string): Promise<SchedulerRunSnapshot | null>;
  loadOccurrence(jobId: string, occurrenceKey: string): Promise<SchedulerRunSnapshot | null>;
  save(run: SchedulerRunRecord, expectedRevision: string): Promise<SchedulerRunSnapshot>;
}

export interface SchedulerAdapterProfile {
  readonly id: string;
  /** Exactly one authority owns lifecycle state; any other store is a projection only. */
  readonly stateAuthority: "run-store" | "workflow-history";
  /** Leases suit simple hosts; durable workflows may provide logical single ownership. */
  readonly executionAuthority: "lease" | "durable-workflow";
}

export interface SchedulerLease {
  readonly key: string;
  readonly owner: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  /** Monotonically unique token checked by every mutating step. */
  readonly fencingToken: string;
}

export interface SchedulerLeaseProvider {
  acquire(input: {
    readonly key: string;
    readonly owner: string;
    readonly ttlSeconds: number;
  }): Promise<SchedulerLease | null>;
  renew(lease: SchedulerLease, ttlSeconds: number): Promise<SchedulerLease>;
  release(lease: SchedulerLease): Promise<void>;
}

export interface ReleaseCandidateFile {
  readonly sourcePath: string;
  readonly publicPath: string;
  readonly sha256: string;
}

export interface ReleaseReview {
  readonly status: "approved" | "rejected" | "needs-review";
  readonly actor: string;
  readonly checkedAt: string;
}

/** Private producer record. It must never be copied wholesale to the public repository. */
export interface ReleaseCandidate {
  readonly schema: typeof RELEASE_CANDIDATE_SCHEMA;
  readonly appId: string;
  readonly jobId: string;
  readonly releaseKey: string;
  readonly sourceDraftId: string;
  readonly sourceRevision: string;
  readonly digest: string;
  readonly files: readonly ReleaseCandidateFile[];
  readonly review: ReleaseReview;
}

export interface PublicReleaseFile {
  readonly path: string;
  readonly sha256: string;
}

/** Safe metadata committed beside public content. Contains no private source paths. */
export interface PublicReleaseManifest {
  readonly schema: typeof PUBLIC_RELEASE_SCHEMA;
  readonly appId: string;
  readonly jobId: string;
  readonly releaseKey: string;
  readonly digest: string;
  readonly generatedAt: string;
  readonly promotedAt: string;
  readonly files: readonly PublicReleaseFile[];
  readonly provenance: {
    readonly generator: string;
    readonly reviewer?: string;
  };
}

export type PublicReleaseReconciliation = "create" | "already-promoted" | "conflict";
export type SchedulerCanonicalReconciliation = "create" | "already-committed" | "conflict";
