# Private plugin runtime spike: Quick Log + Todo List

Status: experimental, locally proven on a GitHub Pages project-base shape

Date: 2026-08-16

The concrete spike integrates the private `page-apps/todo-list-plugin` Module Federation remote into Quick Log. The public host remains usable before connection. After the user explicitly activates the same-origin PAT previously saved by Personal Hub, a root-scoped Service Worker turns the fixed private code repository at one immutable commit into a same-origin virtual filesystem. A separate host-owned capability synchronizes `page-apps/todo-list-data/data/tasks.json`.

The local browser proof ran at `/quick-log/` and loaded the actual sibling remote build, including:

- `mf-manifest.json` and `remoteEntry.js`;
- the exposed React `todo_list/App` module;
- singleton React and React DOM shares at `19.2.8`;
- the lazy `TaskInsights` JavaScript chunk;
- emitted CSS and SVG assets;
- a host-owned, schema-validating task capability backed by a fixed private data repository;
- a save in one browser context, a conflict from another context holding the stale blob SHA, and retrieval of the committed task after reload;
- cache removal and credential clearing on disconnect; and
- an anonymous `401` for the virtual manifest after disconnect.

This proves the browser transport and federation graph locally. It does not yet prove GitHub API latency, rate limits, organization policy, or a real PAT on the deployed `page-apps/quick-log` Pages origin. Keep the feature experimental until that canary is run.

## Reusable host sequence

1. Define a trusted registry entry in source or authenticated fixed data. Fix `id`, owner, repository, artifact prefix, immutable commit SHA and entry path. Never derive these from a route, query string or browser setting.
2. Place the Service Worker script at the Pages project root. A Vite-hashed worker under `assets/` cannot control the wider project path on GitHub Pages because Pages cannot set `Service-Worker-Allowed`.
3. Derive the worker scope and virtual prefix from the worker script location. Match the exact worker origin and `<project-base>/__plugins/` prefix; do not search for `"/__plugins/"` anywhere in a URL.
4. Reject raw traversal segments before `new URL()` normalizes them. Also reject encoded separators, backslashes, mutable refs, unknown ids, query strings, fragments and non-allowlisted MIME types.
5. Register the worker, await activation and wait for `navigator.serviceWorker.controller` before registering a federation remote.
6. Activate the framework shared-credential provider after an explicit user action. Use the framework credential bridge to send the credential to the worker only. The worker adds `Authorization` only to the fixed `api.github.com` Contents request. The virtual request, manifest, remote, caches and logs contain no token.
7. Initialize the Module Federation host with exact shared dependency versions, register the virtual manifest URL, load the exposed module and mount it into an explicit host boundary.
8. Bind `createPrivatePluginStateCapability()` to one host-fixed repository client and path. Map its `load()`/`save()` methods to narrow domain capabilities such as `loadTasks()` and `saveTasks(next, expectedRevision)`. Never pass the token, credential provider, GitHub client, repository selector or arbitrary fetch capability to the remote.
9. Scope every remote stylesheet to its plugin root. Federation CSS is inserted into the host document; unscoped `body`, `:root`, utility or element selectors can silently restyle the host.
10. On disconnect, unmount the remote, clear the worker credential and remove every cache whose name is scoped to that plugin and immutable SHA.

## Test layers

The spike separates three kinds of evidence:

- Framework/unit tests validate descriptors, base paths, fixed GitHub mapping, path rejection, MIME types, cache names and controller messages.
- Worker tests validate fail-closed anonymous access, Authorization header placement, authenticated cache behavior and disconnect cleanup.
- The Quick Log Playwright canary serves the real sibling remote through a loopback-only worker fixture. Loopback fixture mode is rejected on non-loopback origins. The test verifies the complete browser graph without committing or injecting a PAT into CI.

The private remote is intentionally not copied into the public Quick Log repository. Therefore, a checkout without the sibling private repository skips only the full federation canary; package, worker, build and ordinary browser tests still run. A future cross-repository Actions canary requires a deliberately configured read-only credential or GitHub App installation and should remain separate from the public deploy job.

## Composition and data boundaries

Quick Log uses `SharedPatCredentialProvider` to activate the PAT stored by Personal Hub under the versioned same-origin vault key. Loading the plugin is the explicit first-use action; each fixed target is independently verified. Plugin disconnect disables that provider session and clears the worker, but does not delete the global vault.

The Todo remote receives a capability backed by `page-apps/todo-list-data/data/tasks.json`. The host validates every read and proposed write, writes with the last-read blob SHA, returns the new content SHA as the next revision and surfaces `ConflictError` unchanged. The code repository and data repository remain separate fixed identities.

The shared vault is browser-local. A second device must already have the PAT in its own Personal Hub vault (or enter it there once); after that, both devices retrieve the same canonical repository state without per-plugin PAT prompts. A static Pages app cannot synchronize credentials themselves without adding a backend broker.

One fine-grained PAT can cover all targets only when they share one resource owner. GitHub applies a fine-grained token's repository permissions across the selected repository set, so a shared PAT with Contents write for the data repository may also be technically write-capable for the selected plugin repository even though the worker uses it only for reads. Separate credentials remain the least-privilege option when that distinction matters.

Loaded remote code is trusted same-origin first-party code. The Service Worker protects transport access; it does not isolate execution. Untrusted plugins require another origin and a sandboxed iframe/message capability design.

## Promotion and stop criteria

Do not add plugins to the default Repo App manifest until a real Pages canary proves first-load control, private GitHub fetches, reload, cache eviction and rate-limit behavior. Stop the design if it needs Blob rewriting, federation-internal chunk patching, permissive CSP, raw credential access in the remote, unscoped CSS, or repository identity selected at runtime.
