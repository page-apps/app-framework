import assert from "node:assert/strict";
import test from "node:test";
import { createRepoAppShell } from "../dist/index.js";

const manifest = {
  id: "quick-log", title: "Quick Log",
  repository: { mode: "self", branch: "main", dataRoot: "data" },
  auth: { methods: ["pat"], persistence: "session", sharedCredential: false },
  demo: { fixture: "./demo/records.json" },
  writes: { defaultStrategy: "direct", conflictStrategy: "prompt" },
};
const runtime = {
  appId: "quick-log", title: "Quick Log", appVersion: "test",
  repository: { mode: "self", owner: "owner", name: "quick-log", branch: "main", dataRoot: "data" },
  deploymentRepository: { owner: "owner", name: "quick-log" },
};

function fakeClient(overrides = {}) {
  return {
    repository: { owner: "owner", name: "quick-log", branch: "main" },
    verifyAccess: async () => ({ fullName: "owner/quick-log", canRead: true, canWrite: true, defaultBranch: "main" }),
    readFile: async () => ({ path: "data/records.json", sha: "one", content: "[]", size: 2 }),
    list: async () => [],
    createFile: async () => ({ path: "data/records.json", contentSha: "two", commitSha: "commit" }),
    updateFile: async () => ({ path: "data/records.json", contentSha: "two", commitSha: "commit" }),
    getCommitStatus: async () => ({ sha: "commit", state: "success" }),
    getWorkflowStatus: async () => ({ phase: "building" }),
    getPagesDeploymentStatus: async () => ({ phase: "unknown" }),
    deleteFile: async () => { throw new Error("unsupported"); },
    batchCommit: async () => { throw new Error("unsupported"); },
    ...overrides,
  };
}

test("starts in demo, connects, loads, commits, and tracks deployment separately", async () => {
  const shell = createRepoAppShell({ manifest, runtime, client: fakeClient(), demoLoader: () => [{ demo: true }], connect: async () => {} });
  await shell.start();
  assert.equal(shell.state.status, "demo");
  await shell.connect();
  assert.equal(shell.state.status, "ready");
  shell.markDirty([{ id: 1 }]);
  await shell.saveFile({ data: [{ id: 1 }], message: "Add entry" });
  assert.equal(shell.state.status, "committed");
  await shell.refreshDeployment();
  assert.equal(shell.state.status, "building");
});

test("refuses a repository client pointed at another repository", () => {
  assert.throws(() => createRepoAppShell({
    manifest, runtime,
    client: fakeClient({ repository: { owner: "owner", name: "other", branch: "main" } }),
    demoLoader: () => [],
  }), /data repository/);
});

test("fixed private data commits track their declared workflow instead of Pages", async () => {
  const calls = [];
  const fixedManifest = {
    ...manifest,
    id: "bookmark",
    repository: { mode: "fixed", owner: "owner", name: "bookmark-data", branch: "main", dataRoot: "data" },
    dataPipeline: { mode: "actions", workflow: "validate-data.yml", derivedRoot: "generated" },
  };
  const fixedRuntime = {
    appId: "bookmark", title: "Bookmark", appVersion: "test",
    repository: { mode: "fixed", owner: "owner", name: "bookmark-data", branch: "main", dataRoot: "data" },
    deploymentRepository: { owner: "owner", name: "bookmark" },
    dataPipeline: fixedManifest.dataPipeline,
  };
  const shell = createRepoAppShell({
    manifest: fixedManifest,
    runtime: fixedRuntime,
    client: fakeClient({
      repository: { owner: "owner", name: "bookmark-data", branch: "main" },
      getWorkflowStatus: async (sha, workflow) => {
        calls.push({ sha, workflow });
        return { phase: "succeeded" };
      },
      getPagesDeploymentStatus: async () => { throw new Error("Pages must not be queried for private data"); },
    }),
    demoLoader: () => [],
  });
  await shell.load();
  await shell.saveFile({ data: [{ url: "https://example.com" }], message: "Add bookmark" });
  await shell.refreshCommitStatus();
  assert.equal(shell.state.status, "data-ready");
  assert.deepEqual(calls, [{ sha: "commit", workflow: "validate-data.yml" }]);
});

test("stale SHA becomes a conflict with local and fresh remote data", async () => {
  let reads = 0;
  const conflict = Object.assign(new Error("changed"), { code: "conflict" });
  const shell = createRepoAppShell({
    manifest, runtime,
    client: fakeClient({
      readFile: async () => ({ path: "data/records.json", sha: reads++ ? "two" : "one", content: reads > 1 ? '[{"remote":true}]' : "[]", size: 2 }),
      updateFile: async () => { throw conflict; },
    }),
    demoLoader: () => [],
  });
  await shell.load();
  await assert.rejects(shell.saveFile({ data: [{ local: true }], message: "Save" }), /changed/);
  assert.equal(shell.state.status, "conflicted");
  assert.deepEqual(shell.state.conflict.local, [{ local: true }]);
});

test("delete uses the loaded revision and enters committed without pretending content remains", async () => {
  let deleted;
  const shell = createRepoAppShell({
    manifest, runtime,
    client: fakeClient({
      deleteFile: async (input) => {
        deleted = input;
        return { path: input.path, deletedSha: input.expectedSha, commitSha: "delete-commit" };
      },
    }),
    demoLoader: () => [],
  });
  await shell.load();
  const result = await shell.deleteFile({ message: "Delete records" });
  assert.equal(deleted.expectedSha, "one");
  assert.equal(result.commitSha, "delete-commit");
  assert.equal(shell.state.status, "committed");
  assert.equal(shell.state.data, undefined);
  assert.equal(shell.state.revision, undefined);
});

test("network save stores an offline draft and queues a mutation without claiming a commit", async () => {
  const drafts = new Map();
  const network = Object.assign(new Error("offline"), { code: "network" });
  const draftStore = {
    load: async (appId, path) => drafts.get(`${appId}:${path}`) ?? null,
    save: async (appId, path, draft) => drafts.set(`${appId}:${path}`, draft),
    remove: async (appId, path) => drafts.delete(`${appId}:${path}`),
  };
  const shell = createRepoAppShell({
    manifest, runtime,
    client: fakeClient({ updateFile: async () => { throw network; } }),
    demoLoader: () => [], draftStore,
    now: () => new Date("2026-08-09T00:00:00Z"), createMutationId: () => "mutation-1",
  });
  await shell.load();
  await assert.rejects(shell.saveFile({ data: [{ local: true }], message: "Save offline" }), /offline/);
  assert.equal(shell.state.status, "offline");
  assert.equal(shell.state.draft.baseRevision, "one");
  assert.equal(shell.state.pendingMutations[0].id, "mutation-1");
  assert.deepEqual((await shell.restoreDraft()).data, [{ local: true }]);
  assert.equal(shell.state.status, "dirty");
});

test("batch commit is exposed through the self-bound shell capability", async () => {
  const shell = createRepoAppShell({
    manifest, runtime,
    client: fakeClient({
      batchCommit: async () => ({ previousHeadSha: "one", commitSha: "batch", treeSha: "tree", changedPaths: ["data/a"] }),
    }),
    demoLoader: () => [],
  });
  const result = await shell.batchCommit({ message: "Batch", changes: [{ operation: "write", path: "data/a", content: "a" }] });
  assert.equal(result.commitSha, "batch");
  assert.equal(shell.state.status, "committed");
});
