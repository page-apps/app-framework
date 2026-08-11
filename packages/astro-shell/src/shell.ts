import type {
  BatchCommitInput,
  BatchCommitResult,
  DeleteResult,
  RepositoryClient,
} from "@repo-apps/repo-client";
import {
  createInitialRuntimeState,
  runtimeReducer,
  type RepoAppManifest,
  type RepoAppRuntimeConfig,
  type RuntimeAction,
  type OfflineDraft,
  type PendingMutation,
  type RuntimeState,
} from "@repo-apps/runtime";

export interface RepoAppShellOptions<T> {
  readonly manifest: RepoAppManifest;
  readonly runtime: RepoAppRuntimeConfig;
  readonly client: RepositoryClient;
  readonly demoLoader: () => T | Promise<T>;
  readonly connect?: () => void | Promise<void>;
  readonly dataPath?: string;
  readonly parse?: (source: string) => T;
  readonly serialize?: (data: T) => string;
  readonly onStateChange?: (state: RuntimeState<T>) => void;
  readonly draftStore?: OfflineDraftStore<T>;
  readonly now?: () => Date;
  readonly createMutationId?: () => string;
}

/** IndexedDB/local storage adapters can implement this without coupling the shell to one database. */
export interface OfflineDraftStore<T> {
  load(appId: string, path: string): Promise<OfflineDraft<T> | null>;
  save(appId: string, path: string, draft: OfflineDraft<T>): Promise<void>;
  remove(appId: string, path: string): Promise<void>;
}

export interface SaveFileOptions<T> {
  readonly data: T;
  readonly message: string;
  readonly path?: string;
}

export interface RepoAppShell<T> {
  readonly state: RuntimeState<T>;
  subscribe(listener: (state: RuntimeState<T>) => void): () => void;
  start(): Promise<void>;
  connect(): Promise<void>;
  load(): Promise<void>;
  markDirty(data: T): void;
  saveFile(options: SaveFileOptions<T>): Promise<void>;
  deleteFile(options: { readonly message: string; readonly path?: string }): Promise<DeleteResult>;
  batchCommit(input: BatchCommitInput): Promise<BatchCommitResult>;
  saveDraft(data: T, path?: string): Promise<OfflineDraft<T>>;
  restoreDraft(path?: string): Promise<OfflineDraft<T> | null>;
  clearDraft(path?: string): Promise<void>;
  refreshDeployment(): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): void;
}

/**
 * Headless lifecycle controller for an Astro island or vanilla browser view.
 * It is the generated app's capability surface; raw GitHub requests stay inside RepositoryClient.
 */
export function createRepoAppShell<T>(options: RepoAppShellOptions<T>): RepoAppShell<T> {
  validateBoundary(options);
  const listeners = new Set<(state: RuntimeState<T>) => void>();
  let current = createInitialRuntimeState() as RuntimeState<T>;
  let disposed = false;
  const defaultPath = `${options.runtime.repository.dataRoot.replace(/\/$/, "")}/records.json`;
  const parse = options.parse ?? ((source: string) => JSON.parse(source) as T);
  const serialize = options.serialize ?? ((data: T) => JSON.stringify(data, null, 2) + "\n");
  const now = options.now ?? (() => new Date());
  const createMutationId = options.createMutationId ?? (() => `${now().getTime()}-${Math.random().toString(36).slice(2)}`);

  function dispatch(action: RuntimeAction<T>): void {
    if (disposed) return;
    current = runtimeReducer(current, action);
    options.onStateChange?.(current);
    for (const listener of listeners) listener(current);
  }

  async function start(): Promise<void> {
    const demo = await options.demoLoader();
    dispatch({ type: "LOAD_DEMO", data: demo });
  }

  async function connect(): Promise<void> {
    dispatch({ type: "CONNECT" });
    if (!options.connect) {
      const message = "No credential connection callback was configured for this app shell.";
      dispatch({ type: "FAIL", message });
      throw new Error(message);
    }
    try {
      await options.connect();
      const access = await options.client.verifyAccess();
      if (!access.canRead) {
        dispatch({ type: "UNAUTHORISED", message: "The credential cannot read this app repository." });
        return;
      }
      await load();
    } catch (error) {
      handleError(error, dispatch);
      throw error;
    }
  }

  async function load(): Promise<void> {
    dispatch({ type: "LOAD_START" });
    try {
      const file = await options.client.readFile(options.dataPath ?? defaultPath);
      dispatch({ type: "LOAD_SUCCESS", data: parse(file.content), revision: file.sha });
    } catch (error) {
      handleError(error, dispatch);
      throw error;
    }
  }

  function markDirty(data: T): void {
    dispatch({ type: "DIRTY", data });
  }

  async function saveFile(input: SaveFileOptions<T>): Promise<void> {
    const path = input.path ?? options.dataPath ?? defaultPath;
    dispatch({ type: "SYNC_START" });
    try {
      const result = current.revision
        ? await options.client.updateFile({
            path,
            content: serialize(input.data),
            message: input.message,
            expectedSha: current.revision,
          })
        : await options.client.createFile({ path, content: serialize(input.data), message: input.message });
      dispatch({
        type: "COMMIT_SUCCESS",
        revision: result.contentSha,
        commitSha: result.commitSha,
        ...(result.commitUrl === undefined ? {} : { commitUrl: result.commitUrl }),
      });
      await clearDraft(path);
    } catch (error) {
      if (errorCode(error) === "conflict") {
        let remote: T | undefined;
        try {
          remote = parse((await options.client.readFile(path)).content);
        } catch {
          // The local copy and expected revision still provide a resolvable conflict.
        }
        dispatch({
          type: "CONFLICT",
          local: input.data,
          ...(remote === undefined ? {} : { remote }),
          ...(current.revision === undefined ? {} : { expectedSha: current.revision }),
        });
      } else {
        handleError(error, dispatch);
        if (errorCode(error) === "network" && options.draftStore) {
          await saveDraft(input.data, path);
          queueMutation({
            id: createMutationId(), operation: "save", path, message: input.message,
            queuedAt: now().toISOString(), data: input.data,
            ...(current.revision === undefined ? {} : { expectedSha: current.revision }),
          });
        }
      }
      throw error;
    }
  }

  async function deleteFile(input: { readonly message: string; readonly path?: string }): Promise<DeleteResult> {
    const path = input.path ?? options.dataPath ?? defaultPath;
    if (!current.revision) throw new Error("A loaded file revision is required before delete.");
    const expectedSha = current.revision;
    dispatch({ type: "SYNC_START" });
    try {
      const result = await options.client.deleteFile({ path, message: input.message, expectedSha });
      dispatch({
        type: "DELETE_SUCCESS", commitSha: result.commitSha,
        ...(result.commitUrl === undefined ? {} : { commitUrl: result.commitUrl }),
      });
      await clearDraft(path);
      return result;
    } catch (error) {
      if (errorCode(error) === "conflict") {
        dispatch({ type: "CONFLICT", local: current.data as T, expectedSha });
      } else {
        handleError(error, dispatch);
        if (errorCode(error) === "network") {
          queueMutation({
            id: createMutationId(), operation: "delete", path, message: input.message,
            queuedAt: now().toISOString(), expectedSha,
          });
        }
      }
      throw error;
    }
  }

  async function batchCommit(input: BatchCommitInput): Promise<BatchCommitResult> {
    dispatch({ type: "SYNC_START" });
    try {
      const result = await options.client.batchCommit(input);
      dispatch({
        type: "BATCH_COMMIT_SUCCESS", commitSha: result.commitSha,
        ...(result.commitUrl === undefined ? {} : { commitUrl: result.commitUrl }),
      });
      return result;
    } catch (error) {
      handleError(error, dispatch);
      throw error;
    }
  }

  async function saveDraft(data: T, path = options.dataPath ?? defaultPath): Promise<OfflineDraft<T>> {
    if (!options.draftStore) throw new Error("No offline draft store was configured for this app shell.");
    const draft: OfflineDraft<T> = {
      data,
      savedAt: now().toISOString(),
      ...(current.revision === undefined ? {} : { baseRevision: current.revision }),
    };
    await options.draftStore.save(options.runtime.appId, path, draft);
    dispatch({ type: "DRAFT_SAVED", draft });
    return draft;
  }

  async function restoreDraft(path = options.dataPath ?? defaultPath): Promise<OfflineDraft<T> | null> {
    if (!options.draftStore) return null;
    const draft = await options.draftStore.load(options.runtime.appId, path);
    if (draft) dispatch({ type: "DRAFT_RESTORED", draft });
    return draft;
  }

  async function clearDraft(path = options.dataPath ?? defaultPath): Promise<void> {
    if (options.draftStore) await options.draftStore.remove(options.runtime.appId, path);
    dispatch({ type: "DRAFT_CLEARED" });
  }

  function queueMutation(mutation: PendingMutation<T>): void {
    dispatch({ type: "MUTATION_QUEUED", mutation });
  }

  async function refreshDeployment(): Promise<void> {
    if (!current.commitSha) return;
    try {
      const [workflow, pages] = await Promise.all([
        options.client.getWorkflowStatus(current.commitSha),
        options.client.getPagesDeploymentStatus(current.commitSha),
      ]);
      if (pages.phase === "published") dispatch({ type: "PUBLISH_SUCCESS" });
      else if (workflow.phase === "queued" || workflow.phase === "building" || workflow.phase === "succeeded") {
        dispatch({ type: "BUILD_START" });
      } else if (workflow.phase === "failed" || pages.phase === "failed") {
        dispatch({ type: "FAIL", message: "The repository build or Pages deployment failed." });
      }
    } catch (error) {
      handleError(error, dispatch);
      throw error;
    }
  }

  async function disconnect(): Promise<void> {
    dispatch({ type: "DISCONNECT" });
  }

  return {
    get state() { return current; },
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    start, connect, load, markDirty, saveFile, deleteFile, batchCommit,
    saveDraft, restoreDraft, clearDraft, refreshDeployment, disconnect,
    dispose() { disposed = true; listeners.clear(); },
  };
}

function validateBoundary<T>(options: RepoAppShellOptions<T>): void {
  if (options.manifest.id !== options.runtime.appId) {
    throw new Error("Manifest and runtime app identities do not match.");
  }
  if (options.manifest.repository.mode !== "self") throw new Error("Only self repository mode is supported.");
  const configured = options.client.repository;
  const runtime = options.runtime.repository;
  if (configured.owner !== runtime.owner || configured.name !== runtime.name || configured.branch !== runtime.branch) {
    throw new Error("Repository client must be bound to the app's resolved self repository.");
  }
}

function handleError<T>(error: unknown, dispatch: (action: RuntimeAction<T>) => void): void {
  const code = errorCode(error);
  if (code === "authentication") dispatch({ type: "TOKEN_EXPIRED", message: "Connect a valid GitHub credential." });
  else if (code === "permission" || code === "not-found") dispatch({ type: "UNAUTHORISED", message: "The credential cannot access this app repository." });
  else if (code === "rate-limit") {
    const retry = retryAt(error);
    dispatch(retry === undefined ? { type: "RATE_LIMITED" } : { type: "RATE_LIMITED", retryAt: retry });
  }
  else if (code === "network") dispatch({ type: "OFFLINE", message: "GitHub could not be reached." });
  else dispatch({ type: "FAIL", message: safeMessage(error) });
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function retryAt(error: unknown): string | undefined {
  return isRecord(error) && error.retryAt instanceof Date ? error.retryAt.toISOString() : undefined;
}

function safeMessage(error: unknown): string {
  if (!isRecord(error) || typeof error.message !== "string") return "The repository operation failed.";
  // Repository errors are already normalized. Avoid echoing arbitrary transport/server bodies.
  return typeof error.code === "string" ? error.message : "The repository operation failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
