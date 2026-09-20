import {
  SCHEDULER_RUN_SCHEMA,
  type SchedulerRunRecord,
  type SchedulerRunState,
} from "./types.js";
import { validateSchedulerLease, validateSchedulerRun } from "./validation.js";

const transitions: Readonly<Record<SchedulerRunState, readonly SchedulerRunState[]>> = {
  queued: ["claimed", "skipped", "cancelled", "failed"],
  claimed: ["generating", "retry-wait", "failed", "cancelled"],
  generating: ["validating", "retry-wait", "failed", "cancelled"],
  validating: ["needs-review", "approved", "committing", "retry-wait", "failed", "cancelled"],
  "needs-review": ["approved", "cancelled"],
  approved: ["promoting", "committing", "cancelled"],
  committing: ["committed", "retry-wait", "failed", "conflicted", "cancelled"],
  committed: [],
  promoting: ["promoted", "retry-wait", "failed", "conflicted", "cancelled"],
  promoted: ["building", "cancelled"],
  building: ["published", "retry-wait", "failed", "cancelled"],
  "retry-wait": ["claimed", "failed", "cancelled"],
  published: [],
  failed: [],
  conflicted: [],
  skipped: [],
  cancelled: [],
};

export interface CreateSchedulerRunInput {
  readonly executionId: string;
  readonly jobId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: string;
  readonly createdAt: string;
  readonly outputKind?: import("./types.js").SchedulerOutputKind;
}

export type SchedulerRunPatch = Partial<Pick<SchedulerRunRecord,
  "startedAt" | "candidate" | "review" | "publication" | "deployment" | "canonicalData" | "failure" | "nextAttemptAt"
>>;

export function createSchedulerRun(input: CreateSchedulerRunInput): SchedulerRunRecord {
  const run: SchedulerRunRecord = {
    schema: SCHEDULER_RUN_SCHEMA,
    executionId: input.executionId,
    jobId: input.jobId,
    occurrenceKey: input.occurrenceKey,
    scheduledFor: input.scheduledFor,
    attempt: 1,
    outputKind: input.outputKind ?? "public-release",
    state: "queued",
    updatedAt: input.createdAt,
  };
  validateSchedulerRun(run);
  return Object.freeze(run);
}

export function transitionSchedulerRun(
  run: SchedulerRunRecord,
  nextState: SchedulerRunState,
  updatedAt: string,
  patch: SchedulerRunPatch = {}
): SchedulerRunRecord {
  validateSchedulerRun(run);
  if (!transitions[run.state].includes(nextState)) {
    throw new Error(`Invalid scheduler run transition: ${run.state} -> ${nextState}.`);
  }
  const privateOutput = run.outputKind === "private-canonical";
  if (nextState === "committing" && !privateOutput) {
    throw new Error("Only private-canonical runs may enter committing.");
  }
  if (nextState === "promoting" && privateOutput) {
    throw new Error("Private-canonical runs cannot enter promoting.");
  }
  if (nextState === "committed" && !privateOutput) {
    throw new Error("Only private-canonical runs may enter committed.");
  }
  const retrying = run.state === "retry-wait" && nextState === "claimed";
  const next: SchedulerRunRecord = {
    ...run,
    ...patch,
    state: nextState,
    updatedAt,
    attempt: retrying ? run.attempt + 1 : run.attempt,
  };
  if (retrying) {
    delete (next as { failure?: SchedulerRunRecord["failure"] }).failure;
    delete (next as { nextAttemptAt?: string }).nextAttemptAt;
  }
  validateSchedulerRun(next);
  return Object.freeze(next);
}

export function retryDelaySeconds(
  strategy: "fixed" | "exponential",
  attempt: number,
  baseDelaySeconds: number,
  maxDelaySeconds: number
): number {
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isInteger(baseDelaySeconds) || baseDelaySeconds < 1 ||
    !Number.isInteger(maxDelaySeconds) || maxDelaySeconds < baseDelaySeconds) {
    throw new Error("Retry delay inputs are invalid.");
  }
  if (strategy === "fixed") return baseDelaySeconds;
  if (strategy !== "exponential") throw new Error("Retry strategy must be fixed or exponential.");
  return Math.min(maxDelaySeconds, baseDelaySeconds * (2 ** (attempt - 1)));
}

export function isLeaseExpired(lease: import("./types.js").SchedulerLease, now: string): boolean {
  validateSchedulerLease(lease);
  if (!Number.isFinite(Date.parse(now))) throw new Error("Lease comparison time must be an ISO-8601 timestamp.");
  return Date.parse(now) >= Date.parse(lease.expiresAt);
}
