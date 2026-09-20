# App Framework Patterns and Platform Boundaries

Status: Working architecture guide

Date: 2026-08-15

This guide names the supported GitHub Pages and PAT patterns, makes their security boundaries explicit, and defines how an app can remain responsive while GitHub commits, Actions and Pages converge asynchronously.

## Shared invariants

Every pattern keeps these rules:

- GitHub is the remote system of record; browser state is a draft, cache or pending overlay.
- A Pages artifact is public. A private source repository does not make deployed HTML, JavaScript, CSS, source maps or embedded values private.
- A PAT is entered at runtime and sent only to `https://api.github.com` by the shared repository client. It is never a build input or Pages asset.
- The app targets only the deployment repository or one manifest-declared data repository. A URL, route parameter or browser setting cannot select another repository.
- The UI may hide an authenticated view, but GitHub repository permissions—not the route guard—protect private data.
- A successful commit, a successful data workflow and a successful Pages deployment are different events.

## Pattern catalogue

| Pattern | Repository shape | Read freshness | Write lifecycle | Best fit |
| --- | --- | --- | --- | --- |
| Self-repository app | Public or private app source, canonical data and Pages deployment in one repository | The built page may lag; authenticated API reads can be current | Commit → validate/build → publish | Small apps whose data can share the app repository |
| Public shell, fixed private data | Public Astro/Pages repository plus one private data repository | Runtime API reads are current | Commit → optional private validation; no public rebuild | Personal data that must not enter the public artifact |
| Agent-produced public reader | Private editorial/agent repository plus a public reader repository | Anonymous readers see the latest deployed public commit | Generate → validate/review → promote public content → build/deploy | AI Daily Briefs, digests, blogs and generated knowledge sites |
| Authenticated workspace in a public shell | Public marketing/blog/demo routes plus public workspace code that reads one private repository after connection | Runtime API reads are current | Same as fixed private data | A public site with owner-only tools or views |
| Hub with bounded children | Parent at the repository root and children at `apps/<app-id>/` | Defined independently per parent and child | Parent and child lifecycles remain separate | Navigation and summaries across several repo apps |

The authenticated-workspace pattern is a specialization of the fixed-private-data pattern, not a new authentication system.

For the proposed mixed blog/personal app, use the third pattern: keep the Astro routes and components in the public build, keep canonical records and generated indexes in the fixed private repository, and let the authenticated workspace fetch them at runtime. This gives record changes immediate runtime visibility without adding module federation or rebuilding the blog.

The agent-produced public reader pattern is different from the fixed-private-data pattern. It is the correct choice when the generated content is intended for anyone to read without a PAT. The private repository is an editorial and production boundary; it is not a runtime data source for the anonymous Pages site. A publication step must copy the public-safe release into the public reader repository before the Pages workflow can deploy it.

## Agent-produced public reader

Use this pattern when a local machine, scheduled worker or coding-agent host generates content on a recurring basis and the result is a public, read-only site. The reader should not know where or how the content was generated.

```text
private editorial repository                 public reader repository
├── prompts/                                 ├── content/ or public data
├── drafts/                                  ├── src/ reader application
├── research/                                └── .github/workflows/deploy.yml
└── review/provenance                             │
        │ generate, validate and review            │ build and deploy
        └──────── promote public-safe release ─────┘
                                                        │
                                                        ▼
                                              anonymous GitHub Pages reader
```

The private repository may be pushed by the agent host as often as needed, but it must not be used as a direct source for anonymous browser requests. The public reader repository is the publication boundary and contains only content that is safe to disclose publicly. Its Pages artifact is public by definition.

The normal lifecycle is:

1. The agent creates an immutable, date- or release-keyed draft in the private editorial repository. Drafts retain prompts, source links, generator identity and validation results needed for audit and repeatability.
2. Deterministic checks run before publication. Depending on the domain, an independent reviewer agent, a human approval or both can be required. A failed or uncertain draft stays private.
3. A publisher promotes exactly the selected public-safe files to the public reader repository in an idempotent commit or pull request. It must not send private draft bodies, credentials or full research context in a repository-dispatch payload or log.
4. The public repository validates the published content, builds the reader and deploys Pages. Only after this succeeds is the release visible to anonymous readers.

Keep these states separate:

- `Draft`, `Validating`, `Needs review` and `Rejected` belong to the private editorial pipeline.
- `Promoted` means the public repository accepted the release commit.
- `Building` and `Published` belong to the public Pages pipeline.

The public reader needs no PAT and must not fetch the private repository at runtime. If readers must access content that remains private, use the fixed-private-data or authenticated-workspace pattern instead. If all generated content should be visible, the promotion target—not the editorial repository—must be public.

For AI Daily, the local Codex/Copilot runner creates bundles in the private editorial repository, the automatic or human review gate decides whether a bundle is publishable, and the selected daily and news Markdown files are promoted to the public `ai-news-daily` repository. The public site then builds only stable content; private drafts remain available only to the editorial workflow and review UI.

### Publication boundary rules

- Give the generator write access to the private editorial repository and give the publisher only the narrow public-repository capability it needs.
- Prefer a protected publication branch or pull request when the content has meaningful reputational, legal or safety risk.
- Pin the public release to a date, pipeline or content revision and make reruns idempotent. If the public target already contains different content for the same release key, stop with a conflict.
- Validate the public repository independently. Private validation is not evidence that the public artifact contains no private fields.
- Keep raw credentials, private prompts, unpublished drafts, hidden source notes and agent state outside the public repository and Pages artifact.
- Treat public content, HTML, JavaScript, source maps, generated indexes and URLs as public even when the source generator is private.
- Never claim that a private editorial commit is published. The release is visible only after the public commit and Pages deployment complete.

## Authenticated workspace in a public Astro site

An Astro site may mix public pages such as a blog, documentation or a demo with workspace routes that become useful after PAT connection:

```text
Public Pages artifact
├── /                         public home or blog
├── /posts/...                public static content
├── /workspace/               public empty shell and connection UI
└── workspace components      public compiled JavaScript and CSS
                                  │
                                  │ PAT-authenticated REST requests
                                  ▼
                           fixed private data repository
                           ├── data/       canonical
                           └── generated/  private, replaceable indexes
```

Loading `/workspace/` directly must return a harmless public shell. After hydration, the app checks for a credential, verifies access to the fixed repository, and then fetches and renders private records. Without a valid credential it shows the connection or demo state. Do not pre-render private record titles, identifiers, route lists, counts or search indexes into the page.

Call these routes **authenticated views** or an **authenticated workspace**, rather than private routes. Static client-side redirection, hidden navigation and `robots.txt` are presentation and discovery controls only; they are not access control.

### Components from a private repository

There are two very different meanings of “private components”:

1. **Private component source compiled into the public app.** A build workflow may check out or install component source from a private repository, but the resulting browser code and assets are public. This can hide source history or authoring workflow, not shipped behavior or embedded values. Pin the dependency revision, use a read-only build credential, publish no source maps unless intended, and assume a user can inspect or reverse engineer the output.
2. **Private data rendered by public components.** This is the recommended pattern. Components ship with the public Astro app and receive validated data from the fixed repository client only after authentication.

Private component source must never contain secrets or private records. A component-source change requires a new public app build; a private-data change does not.

Do not give the public app build access to the private data repository merely to obtain components. GitHub repository permissions are not a path-level sandbox: that credential and every trusted build step could read the data as well as the component folder. Keep reusable components in the public app or in a separate code-only package repository with a read-only build credential. Keep the runtime data PAT out of Actions in both cases.

Module Federation is not part of the baseline fixed-data contract. Directly teaching the federation loader about PATs would have to handle the manifest or `remoteEntry.js`, every dynamically imported JavaScript chunk, CSS, fonts, images, JSON, WASM, shared dependencies and public-path resolution. Prefer normal build-time packages for reusable UI and runtime API calls for private data unless the experimental spike below succeeds.

## Experimental pattern: Service Worker virtual plugin origin

Status: Spike candidate; not an MVP guarantee or a security boundary.

The idea is worth prototyping because current Module Federation runtime APIs expose runtime remote registration/loading and hooks for custom resource loading. The experiment should not make Module Federation authentication-aware. It should make a private remote look like an ordinary same-origin static remote:

```text
Module Federation runtime
          │ normal URLs
          ▼
/__plugins/workspace/9f51eab/*
          │
          ▼
Service Worker virtual filesystem
          │ PAT-authenticated fetch
          ▼
GitHub REST Contents API
          │
          ▼
private-workspace@9f51eab/dist/*
```

### Remote shape

A private first-party remote can be built as a normal Module Federation/Vite artifact:

```text
private-workspace/
└── dist/
    ├── mf-manifest.json
    ├── remoteEntry.js
    └── assets/
        ├── Workspace-S7d91.js
        ├── Notes-X91da.js
        ├── vendor-react-K82.js
        ├── workspace-A91.css
        └── logo.svg
```

The host registers a version-pinned entry, for example:

```ts
registerRemotes([
  {
    name: "workspace",
    entry: "/__plugins/workspace/9f51eab/mf-manifest.json",
  },
]);

const module = await loadRemote("workspace/Workspace");
```

The registry should contain an immutable commit SHA, the private repository identity, the entry path, and an allowlisted artifact prefix. A mutable `main` ref is unsuitable for immutable caching and can make the manifest, chunks and CSS disagree during a deployment.

### Virtual request mapping

The Service Worker handles only a strict same-origin prefix such as `/__plugins/<id>/<sha>/`. It must reject unknown plugin ids, path traversal, encoded separators, arbitrary repository names and paths outside the declared `dist/` prefix.

```text
/__plugins/workspace/9f51eab/remoteEntry.js
    → repos/OWNER/private-workspace/contents/dist/remoteEntry.js?ref=9f51eab

/__plugins/workspace/9f51eab/assets/Notes-X91da.js
    → repos/OWNER/private-workspace/contents/dist/assets/Notes-X91da.js?ref=9f51eab
```

The worker fetches the GitHub response with the PAT and the raw-content media type, then returns a same-origin `Response` with a validated MIME type (`text/javascript`, `text/css`, `image/svg+xml`, `font/*`, `application/json`, and so on). It should preserve useful cache validators and reject content that does not match the expected artifact type. This transport must support the entire remote graph, not only `remoteEntry.js`:

- dynamic JavaScript chunks;
- CSS and fonts;
- images, SVG and JSON assets;
- WASM if the bundler emits it; and
- any preload or manifest request generated by the federation runtime.

The remote can continue to use normal relative imports such as `./assets/Notes-X91da.js`. No Blob rewriting or federation-runtime chunk patch should be needed. If it is needed, this spike has crossed the stop boundary.

The manifest and emitted remote must use relative or virtual-prefix-safe asset URLs. An absolute `https://private-origin/...` URL or an unscoped `/assets/...` URL bypasses the worker mapping and is a failed fixture, not a new loader feature to paper over.

### Credentials and cache

The window sends a credential-ready or credential-cleared message to the Service Worker. A worker cannot use `window.localStorage`; it may keep a short-lived token in memory and/or use the existing app credential storage in IndexedDB. Worker restarts, browser reloads and token disconnects must be explicit lifecycle events. The runtime data PAT must never be placed in a URL, manifest, remote code, cache key or public artifact.

Cache keys should include the immutable plugin commit SHA. A successful fetch can be cached as a private local copy because the version cannot change; authenticated responses must never be placed in a shared public CDN or Pages artifact. The worker must require an active credential before serving a cache hit, clear the plugin cache on disconnect when policy requires it, and never treat a cache entry as authorization. Cache eviction must degrade to a fresh authenticated fetch, not silently expose stale or unauthorised content.

This is not a browser security sandbox. The loaded remote still executes as same-origin JavaScript and can read the DOM, same-origin resources and any data the host exposes to it. Treat this as a trusted first-party plugin model. Third-party or untrusted plugins require a separate origin, iframe/sandbox design and a different threat model.

### Private plugin state capability

Keep immutable plugin artifacts and mutable canonical state in separate fixed repositories. The host may reuse an explicitly approved same-origin shared PAT, but it must independently verify code-repository read access and data-repository read/write access. It then binds `createPrivatePluginStateCapability()` to one repository client and one path and passes only domain methods to the remote.

The capability validates repository text on read, validates and deterministically formats proposed state on write, requires the last-read blob SHA and returns the new content SHA. A stale SHA remains a visible conflict. The plugin cannot choose a repository or path and never receives the PAT, credential provider, repository client or arbitrary fetch. The Service Worker continues to handle only immutable artifact URLs; mutable state requests go directly through the repository client and are never stored in the plugin artifact cache.

Same-origin credential storage removes repeated prompts on one browser profile, not across devices. Cross-device state sync comes from the fixed Git repository. Each device still needs its own approved credential vault unless a future backend credential broker is introduced.

### Service Worker and Pages lifecycle constraints

The host must register the worker before attempting to load a private remote and wait until it is active and controlling the page. The first visit may need a harmless public shell, a `controllerchange` wait, or a reload before `/__plugins/` requests can work. A remote must never be requested through the virtual prefix before control is established.

GitHub Pages project sites have a base path (`/site-name/`) unless a custom domain is used. The worker script, registration scope, virtual prefix, Module Federation public path and relative asset URLs must all be base-path aware. A custom-domain development test is insufficient; the project-site deployment is the compatibility target.

The effective CSP must permit Service Worker registration/execution, same-origin module/style loading and the worker's authenticated API access. A future host CSP can narrow any of these capabilities. If registration, API access or a required resource type is blocked, the app must show an unavailable-plugin state and retain the normal public shell.

### Recommended spike fixture

Build a deliberately non-trivial first-party remote with:

- exposed `./App`, `./Button` and `./Notes` modules;
- React shared from the host, including singleton/version negotiation;
- at least one dynamically imported chunk;
- CSS, an image/SVG and a font or other non-JavaScript asset; and
- a commit-SHA-pinned manifest and artifact directory.

The spike succeeds only if all of these are demonstrated from an actual GitHub Pages project-site origin:

1. The manifest or `remoteEntry.js` is private and unavailable without a PAT.
2. Multiple exposed components load.
3. Dynamic imports load without rewriting the chunk graph.
4. CSS, images and fonts load with correct MIME types.
5. Shared React works without duplicate-runtime failures.
6. The PAT never appears in a URL, browser request to the plugin path, bundle or cache key; only the worker's GitHub API request carries the `Authorization` header.
7. An anonymous browser receives no private plugin bytes.
8. A new plugin commit can be selected without rebuilding the Astro host.
9. Reload and cache eviction recover correctly.

Stop and park the experiment if it requires patching Module Federation internals for chunk resolution, cannot reliably control the first request, breaks CSS/fonts/WASM, depends on permissive host CSP, leaks the token to remote code, or consumes GitHub API quota/latency unacceptably. The baseline public-component/fixed-data pattern remains the fallback.

## Responsive writes over an asynchronous repository

The user-visible data model has three layers:

```text
remote canonical snapshot + local draft/pending overlay = rendered application state
```

The rendered UI should update as soon as the user makes a valid edit. It must not wait for Actions or Pages. Persistence proceeds independently:

```text
edit locally
→ validate locally
→ save with the last-read revision
→ commit accepted by GitHub
→ optional data validation
→ optional Pages publication
```

Use precise labels:

- `Dirty` means the edit exists only in the browser.
- `Syncing` means a repository write is in flight.
- `Committed` means GitHub accepted the new canonical revision.
- `Validating` / `Data ready` refer only to a private data workflow.
- `Building` / `Published` refer only to the Pages deployment.

Never show `Committed` optimistically before the GitHub API returns success. Optimism applies to the rendered data, not to the durability label.

### Local persistence and reconciliation

Small drafts and status metadata may use app-namespaced `localStorage`. Prefer IndexedDB for private record caches or a mutation queue because it is asynchronous and handles structured or larger data. Both are origin-scoped local copies and require an explicit **Clear local data** action.

A durable pending mutation should record at least:

```ts
interface PendingMutation<T> {
  id: string;
  operation: "save" | "delete";
  path: string;
  expectedSha?: string;
  data?: T;
  queuedAt: string;
  commitSha?: string;
  status: "queued" | "syncing" | "committed" | "conflicted";
}
```

On startup or reconnection:

1. Load the local draft and pending metadata.
2. Read the current canonical file and revision through the GitHub API.
3. If a recorded commit is already remote, clear its pending overlay.
4. If the base revision still matches, retry only after an explicit policy allows it.
5. If the revision changed, enter the normal conflict flow; never replay blindly or silently overwrite.

After a successful commit, update the in-memory base revision from the API response and keep rendering the committed value. In fixed-data mode, no Pages rebuild is required. If a generated private index is still stale, use canonical data plus the local overlay until the matching data workflow becomes ready.

In self mode, the current session can render the committed value while Pages is building. After a reload, an authenticated app should read canonical data from the API rather than trusting a stale pre-rendered copy. An unauthenticated visitor continues to see the previous public build until publication finishes.

## Platform assumptions and failure boundaries

This architecture is viable only while the following external contracts hold. Treat them as monitored dependencies, not permanent guarantees.

| Dependency | Current assumption | If it changes | Required behavior |
| --- | --- | --- | --- |
| GitHub Pages | Serves a static HTTPS application and has no server-side per-user route authorization | Public shell may still load, but authenticated behavior or hosting may become unsuitable | Fail closed for private data; move to another static host or a backend if necessary |
| Browser CSP | The effective policy permits the app's own scripts and `connect-src https://api.github.com` | API calls or dynamically loaded code are blocked | Detect the network/CSP failure, retain local drafts and show a platform-unavailable state |
| GitHub REST CORS | `api.github.com` accepts browser CORS requests, including `Authorization` and required read/write methods | A Pages-only app cannot exchange the PAT for private data | Disable connect/sync; keep demo/local-export paths; a backend proxy is an architecture change |
| Fine-grained PATs | A token can be restricted to the fixed repository and minimum Contents permissions | Connection may be denied by token expiry, organization approval, SSO or future policy | Explain the permission failure without widening scope automatically |
| REST API stability | Used endpoints and the pinned API version retain compatible request/response contracts | Reads, writes or status polling can fail | Centralize calls, normalize errors and test against a canary repository before release |
| REST rate limits | Personal, low-frequency use stays below primary and secondary limits | Polling or rapid writes receive rate-limit responses | Batch reads/writes, use ETags, honor retry headers and stop aggressive workflow polling |
| GitHub Actions | Data and deployment workflows are asynchronous and may fail or be unavailable | Derived indexes or the deployed artifact lag behind canonical commits | Keep `Committed` distinct; show validation/publication as unknown or failed, never roll back a valid commit implicitly |
| Browser storage | Storage is available only as a convenience on the current origin and device | Private mode, quota, eviction or clearing removes drafts/caches | Continue in memory, disclose loss risk and provide export/recovery where the app needs it |

The app should set its own restrictive CSP where practical, with an explicit GitHub API connection allowance. It must not depend on permissive `script-src`, `unsafe-eval`, cross-origin runtime modules or third-party scripts. A stricter CSP supplied by the host can only narrow what the app allows.

Service workers may cache versioned public assets but must bypass authenticated API requests and responses. Never place a PAT in a URL because URLs can leak through history, logs and referrers.

Run a scheduled compatibility probe from an actual Pages origin that checks at least the API CORS preflight, a read from a canary repository and the response/error shapes the client depends on. Authenticated write probes should use a dedicated private canary repository and the same minimum token permissions, never production data.

## Schema and deployment compatibility

The fixed-data pattern removes the rebuild wait only when the installed public app understands the new data. Prefer additive schema changes and deploy a reader that accepts both the old and new shape before migrating canonical data. A private data workflow may reject an incompatible revision, but it cannot make an older installed app understand it.

A component or schema-reader change still requires the public pipeline. A record-only change should not.

## When this pattern is the wrong boundary

Add a backend, GitHub App or different host when the product needs any of the following:

- genuinely private routes or server-rendered private HTML;
- untrusted or multiple users with different authorization rules;
- sensitive data for which a browser-held bearer token is unacceptable;
- centralized credential revocation, audit or policy enforcement;
- high-frequency writes, realtime collaboration or database transactions;
- server-managed cookies, custom response headers or a mandatory CSP that static Pages cannot reliably provide; or
- continued operation if browser access to the GitHub REST API is withdrawn.

## External contracts

- [GitHub REST API CORS support](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)
- [Authenticating to the REST API](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)
- [Repository Contents API permissions and conflicts](https://docs.github.com/en/rest/repos/contents)
- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [GitHub Pages HTTPS and public-site warning](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Module Federation runtime hooks](https://module-federation.io/guide/runtime/runtime-hooks)
- [Module Federation runtime API](https://module-federation.io/guide/runtime/runtime-api)
- [Module Federation multiple shared scopes](https://module-federation.io/guide/advanced/multiple-shared-scope)
- [Module Federation Vite plugin](https://github.com/module-federation/vite)
