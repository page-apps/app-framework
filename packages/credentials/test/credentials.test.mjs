import assert from "node:assert/strict";
import test from "node:test";
import {
  CredentialError,
  PersistentPatCredentialProvider,
  SHARED_CREDENTIAL_KEY,
  SessionPatCredentialProvider,
  SharedPatCredentialProvider,
  appCredentialStorageKey,
  redactSecrets,
} from "../dist/index.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test("session PAT is stored in a versioned app-specific envelope", async () => {
  const storage = memoryStorage();
  const provider = new SessionPatCredentialProvider({
    appId: "quick-log",
    requestToken: () => "github_pat_example_12345678",
    storage,
    now: () => new Date("2026-08-09T00:00:00.000Z"),
  });
  await provider.connect();
  const stored = JSON.parse(storage.values.get(appCredentialStorageKey("quick-log")));
  assert.equal(stored.version, 1);
  assert.equal(stored.scope, "app");
  assert.equal((await provider.get()).token, "github_pat_example_12345678");
  await provider.disconnect();
  assert.equal(await provider.get(), null);
});

test("persistent providers cannot read another app's credential", async () => {
  const storage = memoryStorage();
  const first = new PersistentPatCredentialProvider({ appId: "one", requestToken: () => "token-one", storage });
  const second = new PersistentPatCredentialProvider({ appId: "two", requestToken: () => "token-two", storage });
  await first.connect();
  assert.equal(await second.get(), null);
});

test("corrupt storage is removed and rejected", async () => {
  const storage = memoryStorage();
  storage.setItem(appCredentialStorageKey("quick-log"), "not-json");
  const provider = new PersistentPatCredentialProvider({ appId: "quick-log", requestToken: () => "unused", storage });
  await assert.rejects(provider.get(), (error) => error instanceof CredentialError && error.code === "corrupt-storage");
  assert.equal(storage.getItem(appCredentialStorageKey("quick-log")), null);
});

test("redaction removes GitHub and bearer tokens", () => {
  const result = redactSecrets("github_pat_example_12345678 and Bearer abc.def-ghi");
  assert.equal(result, "[REDACTED] and [REDACTED]");
});

test("shared PAT reuse is explicit and disconnect scopes are distinct", async () => {
  const storage = memoryStorage();
  const first = new SharedPatCredentialProvider({
    appId: "quick-log", repositoryHint: "owner/quick-log", requestToken: () => "github_pat_shared_12345678", storage,
    now: () => new Date("2026-08-09T00:00:00Z"),
  });
  const second = new SharedPatCredentialProvider({
    appId: "reading", repositoryHint: "owner/reading", requestToken: () => "unused", storage,
  });
  await first.connect();
  assert.equal(JSON.parse(storage.getItem(SHARED_CREDENTIAL_KEY)).version, 1);
  assert.equal(await first.hasAppRegistration(), true);
  assert.equal(await second.hasShared(), true);
  assert.equal(await second.hasAppRegistration(), false);
  assert.equal(await second.get(), null, "shared storage is not implicitly exposed");
  assert.equal((await second.useShared()).token, "github_pat_shared_12345678");
  assert.equal(await second.hasAppRegistration(), true);
  assert.deepEqual(await second.listRepositoryHints(), ["owner/quick-log", "owner/reading"]);
  await second.disconnect();
  assert.equal(await second.get(), null);
  assert.notEqual(storage.getItem(SHARED_CREDENTIAL_KEY), null, "session disconnect keeps the origin vault");
  await first.disconnect({ shared: true });
  assert.equal(storage.getItem(SHARED_CREDENTIAL_KEY), null);
});
