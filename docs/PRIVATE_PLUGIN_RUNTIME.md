# Private plugin runtime spike: Quick Log + Todo List

Status: experimental, locally proven on a GitHub Pages project-base shape

Date: 2026-08-15

The concrete spike integrates the private `page-apps/todo-list-plugin` Module Federation remote into Quick Log. The public host remains usable before connection. After a separate session-only plugin credential is supplied, a root-scoped Service Worker turns the fixed private repository at one immutable commit into a same-origin virtual filesystem.

The local browser proof ran at `/quick-log/` and loaded the actual sibling remote build, including:

- `mf-manifest.json` and `remoteEntry.js`;
- the exposed React `todo_list/App` module;
- singleton React and React DOM shares at `19.2.8`;
- the lazy `TaskInsights` JavaScript chunk;
- emitted CSS and SVG assets;
- a host-owned, revision-aware task capability;
- cache removal and credential clearing on disconnect; and
- an anonymous `401` for the virtual manifest after disconnect.

This proves the browser transport and federation graph locally. It does not yet prove GitHub API latency, rate limits, organization policy, or a real PAT on the deployed `page-apps/quick-log` Pages origin. Keep the feature experimental until that canary is run.

## Reusable host sequence

1. Define a trusted registry entry in source or authenticated fixed data. Fix `id`, owner, repository, artifact prefix, immutable commit SHA and entry path. Never derive these from a route, query string or browser setting.
2. Place the Service Worker script at the Pages project root. A Vite-hashed worker under `assets/` cannot control the wider project path on GitHub Pages because Pages cannot set `Service-Worker-Allowed`.
3. Derive the worker scope and virtual prefix from the worker script location. Match the exact worker origin and `<project-base>/__plugins/` prefix; do not search for `"/__plugins/"` anywhere in a URL.
4. Reject raw traversal segments before `new URL()` normalizes them. Also reject encoded separators, backslashes, mutable refs, unknown ids, query strings, fragments and non-allowlisted MIME types.
5. Register the worker, await activation and wait for `navigator.serviceWorker.controller` before registering a federation remote.
6. Send the credential to the worker only. The worker adds `Authorization` only to the fixed `api.github.com` Contents request. The virtual request, manifest, remote, caches and logs contain no token.
7. Initialize the Module Federation host with exact shared dependency versions, register the virtual manifest URL, load the exposed module and mount it into an explicit host boundary.
8. Pass narrow domain capabilities such as `loadTasks()` and `saveTasks(next, expectedRevision)`. Never pass the token, credential provider, GitHub client or arbitrary fetch capability to the remote.
9. Scope every remote stylesheet to its plugin root. Federation CSS is inserted into the host document; unscoped `body`, `:root`, utility or element selectors can silently restyle the host.
10. On disconnect, unmount the remote, clear the worker credential and remove every cache whose name is scoped to that plugin and immutable SHA.

## Test layers

The spike separates three kinds of evidence:

- Framework/unit tests validate descriptors, base paths, fixed GitHub mapping, path rejection, MIME types, cache names and controller messages.
- Worker tests validate fail-closed anonymous access, Authorization header placement, authenticated cache behavior and disconnect cleanup.
- The Quick Log Playwright canary serves the real sibling remote through a loopback-only worker fixture. Loopback fixture mode is rejected on non-loopback origins. The test verifies the complete browser graph without committing or injecting a PAT into CI.

The private remote is intentionally not copied into the public Quick Log repository. Therefore, a checkout without the sibling private repository skips only the full federation canary; package, worker, build and ordinary browser tests still run. A future cross-repository Actions canary requires a deliberately configured read-only credential or GitHub App installation and should remain separate from the public deploy job.

## Composition and data boundaries

Quick Log uses a separate plugin connection rather than reusing its self-repository credential. A fine-grained PAT may grant access to only Quick Log, only the plugin, or both; silently forwarding the app credential would widen assumptions and make failures hard to explain.

The Todo remote currently receives an in-memory demo task capability. Canonical private tasks still belong in a separate fixed data repository. A production capability must use `@repo-apps/repo-client`, validate `data/tasks.json`, write with the last-read blob SHA and surface conflicts instead of overwriting.

Loaded remote code is trusted same-origin first-party code. The Service Worker protects transport access; it does not isolate execution. Untrusted plugins require another origin and a sandboxed iframe/message capability design.

## Promotion and stop criteria

Do not add plugins to the default Repo App manifest until a real Pages canary proves first-load control, private GitHub fetches, reload, cache eviction and rate-limit behavior. Stop the design if it needs Blob rewriting, federation-internal chunk patching, permissive CSP, raw credential access in the remote, unscoped CSS, or repository identity selected at runtime.
