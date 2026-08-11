# Repo Apps Harness — Product Requirements Document

Status: Draft v0.3
Date: 2026-08-11
Audience: Coding agent and project maintainer

## 1. Summary

Repo Apps Harness is an opinionated framework and repository template for building small personal applications hosted on GitHub Pages. It supports both standalone applications and a hub application that composes a small set of child applications.

The core invariant is:

> Each app has one explicit owner, one canonical data boundary and one explicit deployment boundary.

The default topology is still one standalone app per repository. A second supported topology is a hub repository: the parent hub app lives at the repository root and child apps live exactly one level below it, normally under `apps/<app-id>/`. The hub may compose child-app navigation, summaries and links, but it does not erase the child apps' ownership or canonical data boundaries.

The shared framework is consumed as packages or a repository template; it does not centrally store application data.

Each app forms a closed loop:

1. GitHub Pages loads the app.
2. Without credentials, the app runs in read-only demo mode.
3. The user connects a fine-grained PAT or authenticates through GitHub Device Flow.
4. The app verifies that the credential can access its own repository.
5. The app reads canonical data from that repository.
6. The user edits data through the app UI.
7. The shared library commits the change back to the same repository.
8. The commit triggers that repository's GitHub Actions workflow.
9. Actions validates, builds and deploys a new version of that app.
10. The app reports progress from committed to published.

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
- PAT and GitHub Device Flow credential providers.
- An optional unified PAT shared by personal apps on the same browser origin.
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

Cross-repository reads or writes are not part of the standalone MVP. In hub mode, child access is still opt-in: the parent must explicitly declare the child capability and the paths or operations it needs. A hub must never infer broad write access from a child being present under `apps/`.

## 5. Non-goals

The initial framework will not support:

- Unscoped cross-app writes or multiple apps silently sharing one canonical data boundary.
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
- Fine-grained PAT as the baseline credential method.
- GitHub Device Flow as an optional credential method.
- `localStorage` as the default persistent shared-token storage.
- Memory or `sessionStorage` for non-persistent credentials.
- Cookies as an optional credential adapter, with no claim of stronger same-origin isolation.
- IndexedDB for offline drafts, caches and pending mutations where required.
- Zod or an equivalent shared schema library for runtime validation.
- A shared UI library for connection, sync, conflict and deployment states.

## 7. Authentication and shared credential model

### 7.1 One PAT, multiple app repositories

The framework may reuse one user-controlled fine-grained PAT across many personal apps.

```text
Shared PAT
├── quick-log repository
├── reading-tracker repository
├── knowledge-notebook repository
└── developer-inbox repository
```

The PAT must have explicit GitHub access to every app repository that uses it. When a new app repository is created, the user may need to update the PAT's selected repository access in GitHub.

Even when a PAT can access many repositories, each app must use it only against its configured self repository unless additional repository capabilities are explicitly declared.

### 7.2 Same-origin requirement

Shared browser credential storage is available only to apps on the same browser origin.

These project sites can share `localStorage`:

```text
https://page-apps.github.io/quick-log/
https://page-apps.github.io/reading-tracker/
https://page-apps.github.io/knowledge-notebook/
```

Their common origin is `https://page-apps.github.io`.

Apps on different custom domains or different GitHub Pages owners cannot share browser storage without a separate credential broker, which is outside the MVP.

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

- Memory/session PAT provider.
- Persistent app-specific PAT provider.
- Persistent same-origin shared PAT provider.
- GitHub Device Flow provider.

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

### 8.3 Connect with Device Flow

1. User selects `Connect with GitHub`.
2. The credential provider starts GitHub Device Flow.
3. The app displays the verification URL and user code.
4. The app polls until authorisation succeeds, expires or is denied.
5. The resulting user token is passed to the same repository client used by PAT authentication.
6. The framework verifies access to the app's self repository.

Device Flow remains behind the credential-provider interface because browser and GitHub endpoint constraints may change.

### 8.4 Edit, commit and publish

1. App reads a record from its own repository and retains the current blob SHA or equivalent revision.
2. User edits the record.
3. App validates the new state locally.
4. App commits through the shared repository library to the same repository.
5. The app displays `Committed` and the commit identifier.
6. The commit triggers that repository's Actions workflow.
7. The app observes workflow and Pages deployment status where practical.
8. The app transitions through `Building` and `Published`, or displays an actionable failure.

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

Each app declares a self-repository manifest:

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
    methods: ["pat", "device-flow"],
    persistence: "optional",
    sharedCredential: true,
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

At build time, the framework generates a public runtime configuration containing the resolved owner, repository, branch and app version.

### 9.2 Repository client

The shared library must provide typed operations for:

- Read file from the self repository.
- List directory or tree.
- Create file.
- Update file with expected revision.
- Delete file with expected revision.
- Commit a batch through Git Data APIs when required.
- Query commit, workflow and deployment status.
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

The standard disclosure must not be removable by generated apps:

> This personal app stores a GitHub credential in your browser. A security flaw in this app, one of its dependencies, or another app on the same origin may expose that credential and every repository it can access. Use a fine-grained, expiring token limited to your personal app repositories and minimum permissions. Do not use this design for sensitive multi-user applications.

The framework should still apply dependency pinning, output escaping, content sanitisation, no unnecessary third-party scripts and a restrictive CSP meta policy where practical. These safeguards reduce risk but do not create strong same-origin isolation.

## 11. Shared-token behaviour

Shared credential reuse must be:

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

## 12. MVP scope

The first MVP remains a standalone Quick Log repository created from the framework template. It must complete the full self-repository loop. Hub mode is the next topology milestone and must not weaken the standalone contract.

MVP includes:

- Separate framework and Quick Log repositories.
- Astro shell consumed from the framework.
- Bundled demo mode.
- Build-time self-repository configuration.
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

MVP does not require Device Flow, shared same-origin PAT reuse, delete, batch commits or offline mutation replay to be complete. Their interfaces and documented behaviour are part of the design; implementations follow after the PAT vertical slice works.

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

## 14. Follow-up milestones

1. Device Flow credential provider.
2. Same-origin shared PAT vault.
3. A second standalone app repository to verify credential reuse.
4. IndexedDB drafts and mutation queue.
5. Delete, move and batch commit support.
6. Developer Inbox reference app.
7. Markdown knowledge app with Pagefind.
8. App scaffolding command and generated `AGENTS.md`.
9. Hub repository manifest and one-level child-app layout.
10. Hub catalogue/composition view with explicit child capabilities.
11. Scoped parent/child workflows and safe update scripts.
