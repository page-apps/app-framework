# Repo Apps Patterns and Platform Boundaries

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
| Authenticated workspace in a public shell | Public marketing/blog/demo routes plus public workspace code that reads one private repository after connection | Runtime API reads are current | Same as fixed private data | A public site with owner-only tools or views |
| Hub with bounded children | Parent at the repository root and children at `apps/<app-id>/` | Defined independently per parent and child | Parent and child lifecycles remain separate | Navigation and summaries across several repo apps |

The authenticated-workspace pattern is a specialization of the fixed-private-data pattern, not a new authentication system.

For the proposed mixed blog/personal app, use the third pattern: keep the Astro routes and components in the public build, keep canonical records and generated indexes in the fixed private repository, and let the authenticated workspace fetch them at runtime. This gives record changes immediate runtime visibility without adding module federation or rebuilding the blog.

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

Module federation or authenticated runtime JavaScript loading is not part of this pattern. It adds remote-code trust, version skew, cache invalidation and CSP requirements while providing no confidentiality—the browser must still download the code. Prefer normal build-time packages for reusable UI and runtime API calls for private data.

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
