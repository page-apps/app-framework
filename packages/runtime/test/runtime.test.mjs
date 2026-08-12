import assert from "node:assert/strict";
import test from "node:test";
import { defineRepoApp, resolveRuntimeConfig, runtimeReducer, createInitialRuntimeState } from "../dist/index.js";

const manifest = defineRepoApp({
  id: "quick-log", title: "Quick Log",
  repository: { mode: "self", branch: "main", dataRoot: "data" },
  auth: { methods: ["pat"], persistence: "session", sharedCredential: false },
  demo: { fixture: "./demo/records.json" },
  writes: { defaultStrategy: "direct", conflictStrategy: "prompt" },
});

test("trusted repository metadata is resolved without secrets", () => {
  const config = resolveRuntimeConfig(manifest, { githubRepository: "cmwen/quick-log", commitSha: "abcdef123456789" });
  assert.deepEqual(config.repository, { mode: "self", owner: "cmwen", name: "quick-log", branch: "main", dataRoot: "data" });
  assert.deepEqual(config.deploymentRepository, { owner: "cmwen", name: "quick-log" });
  assert.equal(config.appVersion, "abcdef123456");
  assert.equal(JSON.stringify(config).includes("token"), false);
});

test("a fixed private data repository remains separate from trusted deployment metadata", () => {
  const fixed = defineRepoApp({
    ...manifest,
    id: "bookmark",
    repository: { mode: "fixed", owner: "page-apps", name: "bookmark-data", branch: "main", dataRoot: "data" },
    dataPipeline: { mode: "actions", workflow: "validate-data.yml", derivedRoot: "generated" },
  });
  const config = resolveRuntimeConfig(fixed, {
    githubRepository: "page-apps/bookmark",
    branch: "pages-preview",
    commitSha: "1234567890abcdef",
  });
  assert.deepEqual(config.deploymentRepository, { owner: "page-apps", name: "bookmark" });
  assert.deepEqual(config.repository, {
    mode: "fixed", owner: "page-apps", name: "bookmark-data", branch: "main", dataRoot: "data",
  });
  assert.deepEqual(config.dataPipeline, {
    mode: "actions", workflow: "validate-data.yml", derivedRoot: "generated",
  });
});

test("fixed data targets and derived paths are validated", () => {
  assert.throws(() => defineRepoApp({
    ...manifest,
    repository: { mode: "fixed", owner: "page-apps/other", name: "data", branch: "main", dataRoot: "data" },
  }), /safe owner and name/);
  assert.throws(() => defineRepoApp({
    ...manifest,
    repository: { mode: "fixed", owner: "page-apps", name: "data", branch: "main", dataRoot: "data" },
    dataPipeline: { mode: "actions", workflow: "validate-data.yml", derivedRoot: "data/generated" },
  }), /must not overlap/);
  assert.throws(() => defineRepoApp({
    ...manifest,
    auth: { methods: ["pat"], persistence: "optional", sharedCredential: false },
  }), /Credential persistence/);
});

test("state reducer distinguishes commit, build, and publish", () => {
  let state = runtimeReducer(createInitialRuntimeState(), { type: "LOAD_SUCCESS", data: [], revision: "one" });
  state = runtimeReducer(state, { type: "DIRTY", data: [{ id: 1 }] });
  state = runtimeReducer(state, { type: "SYNC_START" });
  state = runtimeReducer(state, { type: "COMMIT_SUCCESS", revision: "two", commitSha: "commit" });
  assert.equal(state.status, "committed");
  state = runtimeReducer(state, { type: "BUILD_START" });
  assert.equal(state.status, "building");
  state = runtimeReducer(state, { type: "PUBLISH_SUCCESS" });
  assert.equal(state.status, "published");
});

test("state reducer distinguishes private data validation from Pages publication", () => {
  let state = runtimeReducer({ status: "committed", commitSha: "data-commit" }, { type: "DATA_VALIDATION_START" });
  assert.equal(state.status, "validating");
  state = runtimeReducer(state, { type: "DATA_VALIDATION_SUCCESS" });
  assert.equal(state.status, "data-ready");
  state = runtimeReducer(state, { type: "DATA_VALIDATION_FAILURE", message: "Schema check failed" });
  assert.equal(state.status, "data-validation-failed");
  assert.equal(state.message, "Schema check failed");
});

test("conflicts retain local and remote versions", () => {
  const state = runtimeReducer({ status: "syncing", data: "local" }, {
    type: "CONFLICT", local: "local", remote: "remote", expectedSha: "old",
  });
  assert.deepEqual(state.conflict, { local: "local", remote: "remote", expectedSha: "old" });
});

test("offline drafts and pending mutations survive lifecycle state changes", () => {
  const draft = { data: [{ local: true }], savedAt: "2026-08-09T00:00:00Z", baseRevision: "one" };
  let state = runtimeReducer({ status: "offline" }, { type: "DRAFT_SAVED", draft });
  state = runtimeReducer(state, { type: "MUTATION_QUEUED", mutation: {
    id: "m1", operation: "save", path: "data/records.json", message: "Save", queuedAt: draft.savedAt,
    expectedSha: "one", data: draft.data,
  } });
  state = runtimeReducer(state, { type: "LOAD_SUCCESS", data: [], revision: "two" });
  assert.deepEqual(state.draft, draft);
  assert.equal(state.pendingMutations.length, 1);
  state = runtimeReducer(state, { type: "DRAFT_RESTORED", draft });
  assert.equal(state.status, "dirty");
  assert.deepEqual(state.data, draft.data);
  state = runtimeReducer(state, { type: "MUTATION_REMOVED", id: "m1" });
  assert.deepEqual(state.pendingMutations, []);
});

test("delete success clears canonical data and keeps a distinct committed state", () => {
  const state = runtimeReducer({ status: "syncing", data: [1], revision: "blob" }, {
    type: "DELETE_SUCCESS", commitSha: "delete-commit",
  });
  assert.equal(state.status, "committed");
  assert.equal(state.data, undefined);
  assert.equal(state.revision, undefined);
  assert.equal(state.commitSha, "delete-commit");
});
