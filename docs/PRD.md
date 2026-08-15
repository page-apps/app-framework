# Repo Apps Harness — Product Requirements Document

Status: Draft v0.5
Date: 2026-08-15
Audience: Coding agent and project maintainer

## 1. Summary

Repo Apps Harness is an opinionated framework and repository template for building small personal applications hosted on GitHub Pages. It supports both standalone applications and a hub application that composes a small set of child applications.

The core invariant is:

> Each app has one explicit owner, one canonical data repository and one explicit deployment repository. Those repositories may be the same, but neither boundary is implicit.

The default topology is still one standalone app per repository. A second supported topology is a hub repository: the parent hub app lives at the repository root and child apps live exactly one level below it, normally under `apps/<app-id>/`. The hub may compose child-app navigation, summaries and links, but it does not erase the child apps' ownership or canonical data boundaries.

The shared framework is consumed as packages or a repository template; it does not centrally store application data.

Each app forms a closed loop:

1. GitHub Pages loads the app.
2. Without credentials, the app runs in read-only demo mode.
3. The user connects a fine-grained PAT at runtime.
4. The app verifies that the credential can access its configured data repository.
5. The app reads canonical data from that repository.
6. The user edits data through the app UI.
7. The shared library commits the change back to the configured data repository.
8. In self-repository mode, the commit may trigger that repository's validation and Pages workflow.
9. In fixed-data mode, the public shell remains deployed and reads the new data at runtime; it does not claim a Pages rebuild is pending.
10. The app reports the lifecycle that applies to its configured topology.

This is intentionally designed for personal, low-frequency applications. It is not a general-purpose backend, database or real-time collaboration platform.

## 2. Product goal

Make it predictable and inexpensive for a coding agent to create many small, user-owned applications without reimplementing GitHub authentication, repository access, commit handling, deployment status or common UI states.

The framework must provide:

- An Astro application shell.
- A reusable GitHub repository template.
- A shared TypeScript library for GitHub access and app lifecycle.
- GitHub Actions workflows for validation and Pages deployment.
- Documented standalone and hub-repository conventions.
- A predictable one-level child-app folder boundary for hub repositories.
- Parent/child composition without accidental edits to child applications.
- Read-only demo mode without a credential.
- Fine-grained PAT providers with session-first storage.
- A public-shell/private-data topology with one fixed, manifest-declared repository target.
- Public sites that mix unauthenticated content with authenticated workspace views without claiming that static routes are private.
- Immediate local rendering and revision-aware reconciliation while repository, data-workflow and deployment states converge.
- Optional persistent storage only after an explicit browser-risk disclosure.
- Clear documentation of the accepted personal-use security risks.
- Instructions and constraints for coding agents.

## 3. Target user

The initial user is a technical individual who:

- Owns or controls every app repository.
- Understands PAT permissions and repository access.
- Accepts the security limitations of browser-held credentials.
- Wants small personal apps rather than large multi-user products.
- Prefers portable data, inspectable source and Git history.
- Uses coding agents to create and maintain apps.

## 4. Core repository model

### 4.1 Framework repository

The framework has its own repository and contains only reusable assets:

```text
repo-apps-framework/
├── packages/
│   ├── astro-shell/
│   ├── repo-client/
│   ├── credentials/
│   ├── runtime/
│   ├── ui/
│   └── testkit/
├── template/
│   └── personal-app/
└── docs/
```

It may publish versioned npm packages and expose a GitHub repository template.

### 4.2 Standalone app repository

Every generated app has a separate repository:

```text
quick-log/
├── src/
├── data/
├── demo/
├── schemas/
├── public/
├── repo-app.config.ts
├── astro.config.mjs
├── package.json
├── AGENTS.md
└── .github/workflows/deploy.yml
```

A second app such as Reading Tracker or Knowledge Notebook may be another repository with its own data, configuration, history, Actions and Pages deployment.

### 4.3 Hub repository

A hub repository contains one parent app at the repository root and child apps in one predictable directory level:

```text
personal-hub/
├── src/                         # parent hub UI and composition logic
├── data/                        # parent-owned hub data only
├── repo-app.config.ts           # parent manifest
├── package.json                 # parent build and workspace contract
├── apps/
│   ├── quick-log/
│   │   ├── src/
│   │   ├── data/
│   │   ├── repo-app.config.ts
│   │   └── ...
│   └── reading-tracker/
│       ├── src/
│       ├── data/
│       ├── repo-app.config.ts
│       └── ...
└── .github/workflows/
```

The one-level rule is deliberate. It gives coding agents, build scripts and repository maintenance tools a stable boundary: root paths belong to the parent; `apps/<app-id>/` belongs to that child. Deeper nesting inside a child is allowed for its own implementation, but a child app must not introduce another peer-app container such as `apps/<group>/<app-id>/`.

The parent hub may:

- discover child manifests;
- render a catalogue, dashboard or navigation shell;
- link to child routes or child deployments;
- read explicitly declared child summaries through a capability; and
- coordinate an intentional child build or release operation.

The parent hub must not treat `apps/` as one shared data store. Each child retains its own schema, canonical data, tests and ownership boundary. Child folders are excluded from routine parent-app edits unless a task explicitly names a child.

Child apps may be embedded in the hub's Pages artifact or deployed separately. That is a deployment choice, not permission for the parent to mutate child data.

### 4.4 Self-repository access

An app's default and primary repository capability is restricted to the repository from which it is built and deployed.

The app must derive its repository identity during GitHub Actions build from `GITHUB_REPOSITORY` or equivalent trusted build metadata. Normal app setup must not require the user to manually type the owner and repository name.

The derived repository identity is public configuration, not a secret.

Self mode remains supported for apps whose data is suitable for the deployment repository.

### 4.5 Public shell with a fixed data repository

An app may instead declare one fixed canonical data repository that differs from the repository that builds and publishes the app:

```text
page-apps/bookmark       public source and Pages deployment
page-apps/bookmark-data  private canonical bookmark data
```

The data repository owner, name, branch and data root are public manifest configuration. They must not be selected through a URL, arbitrary runtime input or mutable browser storage. The Actions-derived repository identity remains the deployment boundary; the manifest-declared identity becomes the repository-client boundary.

For private personal data this is the recommended topology. A fine-grained PAT should select only the private data repository with `Contents: read and write`. Separating the repositories also prevents that PAT from modifying the code that will receive it on a later visit.

A fixed-data Pages build includes schemas and demo fixtures, never canonical private data. The public repository's Actions pipeline tests and deploys the PWA. The private data repository owns a separate Actions pipeline that can validate canonical data and generate private indexes or summaries. Committing data does not trigger or require deployment of the public shell, but it can still trigger the private data pipeline.

### 4.6 Dual-pipeline lifecycle

The recommended fixed-data topology uses both repositories' pipelines:

| Boundary | Trigger | Pipeline responsibility | Result |
| --- | --- | --- | --- |
| Public app repository | Source or dependency change | Type-check, test, build and deploy PWA | New Pages application version |
| Private data repository | PAT-authenticated data commit | Validate schemas and generate private derived files | Ready or failed data revision |

The PWA reads canonical and generated private files at runtime through the authenticated repository client. A private workflow must never upload its data to the public Pages artifact or send it in a public repository-dispatch payload.

Data workflow tracking is optional. When enabled, the manifest identifies the workflow file and the app may request `Actions: read` in addition to `Contents: read and write`. When disabled or unavailable, the app reports a successful commit without claiming validation succeeded.

Other unscoped cross-repository access remains unsupported. In hub mode, child access is still opt-in: the parent must explicitly declare the child capability and the paths or operations it needs. A hub must never infer broad write access from a child being present under `apps/`.

### 4.7 Authenticated views in a public shell

A public Astro site may combine public blog, documentation or demo routes with an authenticated workspace backed by its fixed private data repository. The workspace route and all compiled components remain part of the public Pages artifact. They must contain no private records, secrets, private indexes or sensitive route metadata.

After hydration, the workspace verifies the PAT against the fixed repository and fetches private data through the shared client. Without access it renders a connection or demo state. This is an authenticated data view, not server-side route protection: hidden links, client redirects and `robots.txt` are not authorization boundaries.

Component source may be installed from a separate private code-only repository during the public build, but its browser output is public and a component change still requires a Pages rebuild. The public build must not receive access to the private data repository merely to obtain components. Runtime module federation is unnecessary for private data and is excluded from the supported pattern. See [the pattern catalogue](PATTERNS.md) for the complete boundary.

### 4.8 Local overlay and eventual remote state

The rendered state is the latest validated canonical snapshot plus a local draft or pending-mutation overlay. Edits update the UI immediately. The app then commits with the last-read revision and changes the durability label only after GitHub acknowledges the write.

Actions and Pages are never on the critical path for rendering an accepted edit. Fixed-data apps continue from `Committed` to optional private validation without rebuilding the public shell. Self-mode apps may keep rendering the committed overlay while Pages builds. On reload, an authenticated app reconciles local pending metadata with a fresh API read before replaying anything.

Small draft metadata may use app-namespaced `localStorage`; private caches and mutation queues should use IndexedDB. Both require clear-local-data behavior and conflict-safe reconciliation.

## 5. Non-goals

The initial framework will not support:

- Unscoped or runtime-selected cross-repository writes.
- A central service storing all app data or settings.
- Anonymous public writes.
- Untrusted multi-tenant applications.
- Real-time collaboration.
- High-frequency writes or event streams.
- Strong multi-record transactions.
- Large binary file storage.
- A general plugin marketplace.
- Arbitrary runtime LLM tool selection.
- Multiple frontend frameworks or hosting providers.
- Arbitrary nesting of peer apps below multiple directory levels.
- A hosted authentication backend operated by this project.
- Protection against every XSS, dependency or same-origin attack.

## 6. Opinionated technology choices

- Astro for the app shell and static build.
- TypeScript for app and framework code.
- GitHub Pages for hosting.
- GitHub REST API and Git Data APIs for repository access.
- GitHub Actions for validation, build and deployment.
- Fine-grained PAT as the only credential method for a purely static browser app.
- `sessionStorage` as the default credential storage.
- Memory-only credentials where reload persistence is unnecessary.
- Explicit opt-in `localStorage` persistence for trusted personal devices.
- IndexedDB for offline drafts, caches and pending mutations where required.
- Zod or an equivalent shared schema library for runtime validation.
- A shared UI library for connection, sync, conflict and deployment states.

## 7. Authentication and credential storage model

### 7.1 One PAT, one minimum repository capability

The recommended token selects exactly the configured data repository for one app.

```text
Bookmark PAT
└── bookmark-data repository (Contents: read and write)
```

Even when a PAT can access more repositories, the framework gives the app a client for only its manifest-declared data repository. Application code receives that repository capability rather than the raw token.

### 7.2 Same-origin requirement

Browser storage is scoped to an origin, not a Pages path. This is a risk boundary, not a feature to rely on by default.

These project sites can read the same `localStorage`:

```text
https://page-apps.github.io/quick-log/
https://page-apps.github.io/reading-tracker/
https://page-apps.github.io/knowledge-notebook/
```

Their common origin is `https://page-apps.github.io`.

Generated apps therefore default to session-only, app-specific credentials and disable shared persistent credentials. A separate custom domain gives an app a separate origin and is recommended when persistent storage is necessary. A credential broker remains outside the static MVP.

### 7.3 Credential providers

Application modules must never read raw tokens directly. The framework exposes:

```ts
interface CredentialProvider {
  connect(): Promise<Credential>;
  get(): Promise<Credential | null>;
  disconnect(options?: { shared?: boolean }): Promise<void>;
}
```

Initial providers:

- Memory PAT provider.
- Session PAT provider (default).
- Persistent app-specific PAT provider (explicit opt-in).
- Same-origin shared PAT provider for backwards compatibility (disabled in generated apps by default).

The shared PAT should use a stable, versioned storage key owned by the framework, such as `repo-apps:credentials:v1`. The storage format must allow future migration without requiring generated apps to understand token details.

## 8. Core user flows

### 8.1 Demo mode

1. User opens an app without a usable credential.
2. The app clearly displays `Demo mode`.
3. It loads bundled fixture data or a configured public read-only snapshot.
4. The user can navigate and try supported interactions.
5. Demo writes do not call privileged GitHub APIs.
6. The app offers `Connect GitHub` to leave demo mode.

Demo mode must never contain or depend on an embedded privileged token.

### 8.2 Connect with PAT

1. User selects `Connect with PAT`.
2. The app displays its exact owner/repository identity.
3. The app explains the required fine-grained permissions.
4. User enters a token or selects an existing same-origin shared token.
5. The framework verifies that the token can read the app's repository.
6. If write access is required, the framework verifies or clearly tests that capability before the first write.
7. The app displays the authenticated account and repository.

The recommended PAT permission is access to only the required app repositories with `Contents: read and write`. Workflow or administration permissions must not be requested unless explicitly required and documented.

### 8.3 Browser authentication boundary

Device Flow is not exposed by generated GitHub Pages apps. GitHub's device-code and token endpoints are intended for headless clients and do not provide the browser CORS contract required by the static application.

A future conventional GitHub sign-in must use a separately reviewed backend or serverless component with a GitHub App or appropriate OAuth flow. A public client ID does not make a client secret safe to embed, and a public CORS proxy is forbidden.

### 8.4 Edit, commit and publish

1. App reads a record from its configured data repository and retains the current blob SHA or equivalent revision.
2. User edits the record.
3. App validates the new state locally.
4. App commits through the shared repository library to its configured data repository.
5. The app displays `Committed` and the commit identifier.
6. In self mode, the commit may trigger the deployment repository's Actions workflow and the app may transition through `Building` and `Published`.
7. In fixed mode with a declared data workflow, the app may transition through `Committed`, `Validating` and `Data ready`; it never treats that workflow as a Pages publication. Without workflow tracking, the app remains safely `Committed`.

The rendered value changes immediately after local validation and remains visible while steps 4–7 run. `Committed` is never shown until the repository API accepts the write. A refresh must reconcile the pending overlay with the current remote revision instead of blindly replaying it.

### 8.5 Conflict

1. An update fails because the remote revision changed.
2. The app must not silently overwrite remote data.
3. Shared UI presents the local and remote versions.
4. User may reload remote, save a copy or explicitly overwrite if the app policy permits it.

## 9. Functional requirements

### 9.0 Hub manifest and composition boundary

A hub manifest declares the parent app and its known children without turning the children into an implicit shared workspace:

```ts
export default defineRepoApp({
  id: "personal-hub",
  title: "Personal Hub",
  repository: { mode: "self", branch: "main", dataRoot: "data" },
  children: {
    root: "apps",
    entries: ["quick-log", "reading-tracker"],
    access: "explicit",
  },
});
```

The exact manifest API may evolve, but the contract is fixed:

- the parent app is rooted at the repository root;
- child app paths are exactly `apps/<app-id>/`;
- child discovery is manifest- or metadata-driven, not based on arbitrary filesystem crawling;
- a child has its own app id, schema and canonical data root;
- parent writes to child paths require an explicit operation and capability; and
- routine parent-agent changes exclude `apps/**` by default.

### 9.1 Application manifest

Each app declares one repository target. A self-contained app uses:

```ts
export default defineRepoApp({
  id: "quick-log",
  title: "Quick Log",
  repository: {
    mode: "self",
    branch: "main",
    dataRoot: "data",
  },
  auth: {
    methods: ["pat"],
    persistence: "session",
    sharedCredential: false,
  },
  demo: {
    fixture: "./demo/records.json",
  },
  writes: {
    defaultStrategy: "direct",
    conflictStrategy: "prompt",
  },
});
```

A public shell backed by a separate private repository uses:

```ts
export default defineRepoApp({
  id: "bookmark",
  title: "Bookmark Garden",
  repository: {
    mode: "fixed",
    owner: "page-apps",
    name: "bookmark-data",
    branch: "main",
    dataRoot: "data",
  },
  dataPipeline: {
    mode: "actions",
    workflow: "validate-data.yml",
    derivedRoot: "generated",
  },
  auth: {
    methods: ["pat"],
    persistence: "session",
    sharedCredential: false,
  },
  demo: { fixture: "./demo/bookmarks.json" },
  writes: { defaultStrategy: "direct", conflictStrategy: "prompt" },
});
```

At build time, the framework generates public, token-free runtime configuration containing both the Actions-derived deployment repository and the resolved canonical data repository. Deployment branch metadata may override the data branch only in `self` mode. An optional data-pipeline configuration identifies one workflow in the data repository and a safe derived-data root.

### 9.2 Repository client

The shared library must provide typed operations for:

- Read file from the configured data repository.
- List directory or tree.
- Create file.
- Update file with expected revision.
- Delete file with expected revision.
- Commit a batch through Git Data APIs when required.
- Query commit, workflow and deployment status.
- Query one declared data workflow by commit SHA without confusing it with the public Pages deployment.
- Normalise authentication, permission, validation, conflict and rate-limit errors.

Generated app code must not call GitHub endpoints directly unless an exception is explicitly documented.

### 9.3 Runtime states

The shell must consistently present:

```text
demo
disconnected
connecting
unauthorised-for-repository
loading
ready
dirty
offline
syncing
committed
validating
data-ready
data-validation-failed
building
published
conflicted
rate-limited
token-expired
failed
```

### 9.4 Data validation

- Every writable collection has a versioned schema.
- Data is validated before commit and after remote read.
- Invalid remote data produces a diagnostic view rather than crashing the app.
- Schema-changing migrations are explicit and documented.

### 9.5 GitHub Actions

Every standalone app repository owns its workflow. A hub repository owns a parent workflow and may define child workflows or child build jobs. The starter workflow must:

1. Install locked dependencies.
2. Type-check and test.
3. Validate that repository's app data and schemas.
4. Build Astro with the repository identity and app version.
5. Deploy the generated artifact to that repository's GitHub Pages site.

Applications may add app-specific generation steps before the Astro build.

A fixed private data repository should have its own workflow that:

1. Runs on pushes that touch canonical data or schemas.
2. Validates every canonical collection.
3. Generates deterministic private indexes or summaries when configured.
4. Writes generated files only under the declared derived-data root.
5. Uses concurrency and path filters to avoid recursive generation loops.
6. Never publishes canonical or derived private data to GitHub Pages or another public artifact.

For hub repositories:

- root validation and build steps operate on the parent by default;
- child validation/build steps are explicit and scoped to the named child;
- changes under `apps/<child>/` must not be rewritten by parent update scripts;
- the hub may fail or warn when a child manifest is invalid; and
- a child deployment is reported separately from the parent hub deployment when it has its own Pages site.

### 9.6 Agent documentation

Every standalone app repository includes `AGENTS.md` describing:

- The standalone app ownership and repository invariant.
- Canonical and generated paths.
- The self-repository access boundary.
- Allowed extension points.
- How to add or change a collection.
- How to run validation and tests.
- Which core auth, token and sync files must not be modified casually.
- The rule that generated code uses the shared library rather than direct GitHub calls.
- The commit, Actions and Pages release loop.

Every hub repository also includes a root scope document stating that `apps/<app-id>/` is a child boundary. Child repositories or child folders include their own scope document. An agent working on the parent must leave child folders untouched unless the user explicitly requests a child change.

## 10. Security model and disclosure

This project deliberately accepts a weaker security model in exchange for simple personal deployment.

The documentation and connection screen must disclose:

- Browser-held credentials can be stolen by XSS, compromised dependencies or malicious same-origin code.
- `localStorage` is scoped to origin, not URL path.
- Apps under the same `https://user.github.io` origin may access the same stored PAT.
- Cookie `Path` is not a strong confidentiality boundary against same-origin scripts.
- GitHub Pages cannot create an `HttpOnly` browser credential for this static architecture.
- Reusing one PAT across apps increases convenience and compromise blast radius.
- Theft of a shared PAT may expose every repository selected for that PAT, not only the compromised app's repo.
- PATs should be fine-grained, expiring and limited to the minimum app repositories and permissions.
- Credentials must never be committed, logged, placed in URLs, embedded in build output or sent to analytics.
- Demo mode contains no privileged credential.
- Service workers must not cache authenticated GitHub API requests or responses.
- IndexedDB or other offline storage may contain private records and must have a clear-local-data action.
- Static workspace routes and their compiled components are public even when their data is PAT-gated.
- The architecture depends on GitHub REST browser CORS and an effective CSP that permits connections to `https://api.github.com`.

The standard disclosure must not be removable by generated apps:

> This personal app uses a GitHub token in your browser to access its configured data repository. A security flaw in this app, a dependency, a browser extension, or another app on the same origin may expose the token and locally cached private data. Use a fine-grained, expiring token limited to the displayed repository and minimum permissions. Session-only storage is recommended.

The framework should still apply dependency pinning, output escaping, content sanitisation, no unnecessary third-party scripts and a restrictive CSP meta policy where practical. These safeguards reduce risk but do not create strong same-origin isolation.

## 11. Shared-token behaviour

Legacy shared credential reuse must be:

- Explicit and opt-in.
- Limited to apps on the same origin.
- Implemented through the shared credential provider rather than app-specific token parsing.
- Accompanied by a list or explanation of the repositories selected for the PAT when that information is available.
- Validated independently by each app against its own repository.
- Reversible through a shared disconnect action.

The UI must distinguish:

- Disconnect this app for the current session.
- Remove the shared credential for every app on this origin.

Apps must also support isolated app-specific credentials when the user does not want to share one token.

Generated apps set `sharedCredential: false`. Shared storage is a backwards-compatible personal-use option, not the default framework recommendation.

## 12. MVP scope

The first MVP remains a standalone Quick Log repository created from the framework template. It must complete the full self-repository loop. Hub mode is the next topology milestone and must not weaken the standalone contract.

MVP includes:

- Separate framework and Quick Log repositories.
- Astro shell consumed from the framework.
- Bundled demo mode.
- Build-time self or fixed data-repository configuration.
- Fine-grained PAT connection.
- Session-only and persistent PAT choices.
- PAT access validation for the Quick Log repository.
- One JSON collection stored inside the Quick Log repository.
- Read, create and update.
- Revision-aware conflict detection.
- Commit status and link.
- Quick Log-owned Actions workflow and Pages deployment.
- Distinct committed/building/published states.
- Standard security disclosure.
- Unit tests for repository client and credential providers.
- One Playwright happy-path test using a fake repository adapter.

MVP does not require shared same-origin PAT reuse, delete, batch commits or offline mutation replay to be complete. Browser Device Flow is explicitly outside the static framework.

## 13. Acceptance criteria

The MVP is accepted when:

1. Quick Log lives in its own repository and deploys its own GitHub Pages site.
2. Its source, configuration, schema, canonical data and workflow are in that repository.
3. No central data repository is required.
4. A visitor without credentials can use a clearly labelled read-only demo.
5. A user can supply a fine-grained PAT.
6. The app derives and displays its own repository identity.
7. The app rejects or explains a PAT that cannot access its repository.
8. No credential exists in source control or generated static assets.
9. The user can create or update a record through the shared repository client.
10. All normal writes target only the Quick Log repository.
11. A stale revision produces a conflict instead of an implicit overwrite.
12. A successful commit triggers the Quick Log repository's Actions workflow.
13. The app distinguishes `Committed` from `Published`.
14. Reloading after deployment shows committed data.
15. The security disclosure explains XSS, same-origin storage and multi-repository shared-PAT risk.
16. A coding agent can add an app-specific view without modifying credential or repository-client internals.

Hub-mode acceptance criteria are separate:

17. A hub has one parent app at the repository root.
18. Every child app is exactly one level below `apps/`.
19. The parent can render child metadata or links through an explicit manifest.
20. Parent maintenance scripts and agent instructions exclude `apps/**` by default.
21. Child canonical data is not silently merged into the parent's canonical data boundary.
22. Parent and child build/deployment status are distinguishable.

Fixed-data acceptance criteria are separate:

23. Runtime configuration distinguishes the deployment repository from the canonical data repository.
24. The data repository target is fixed in the manifest and cannot be overridden through runtime input.
25. The Pages artifact contains demo fixtures and schemas but no canonical private data.
26. A data-repository PAT does not require access to the public application repository.
27. A fixed-data commit is reported as committed, validating or data-ready without claiming a Pages deployment is pending.
28. Authenticated GitHub API responses are excluded from service-worker caches.
29. A private data push can trigger a separately owned validation/generation workflow.
30. The app distinguishes private data validation from public app deployment.
31. Saving works with Contents read/write alone; live data-workflow tracking clearly identifies Actions read as optional.
32. An authenticated workspace route contains no private build-time data and remains harmless when loaded without a PAT.
33. The app renders a valid local edit while sync, validation or publication continues, without labelling it committed early.
34. Reload reconciliation reads the current remote revision before replaying a queued mutation.
35. A private data-only commit does not require a public Pages rebuild.
36. Platform failures such as blocked API CORS or CSP connections fail closed for private data and preserve recoverable local drafts.

## 14. Follow-up milestones

1. Fixed private data-repository runtime support and Bookmark Garden reference app.
2. Clear-local-data lifecycle for private IndexedDB caches.
3. IndexedDB drafts, optimistic rendered overlays and a conflict-safe mutation queue.
4. Delete, move and batch commit support.
5. Developer Inbox reference app.
6. Markdown knowledge app with Pagefind.
7. App scaffolding command and generated `AGENTS.md`.
8. Hub repository manifest and one-level child-app layout.
9. Hub catalogue/composition view with explicit child capabilities.
10. Scoped parent/child workflows and safe update scripts.
11. Optional backend-auth architecture for apps that outgrow PAT entry.
