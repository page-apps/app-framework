# Experimental private plugin runtime

`@repo-apps/plugin-runtime` contains the host-side contracts proven by the Quick Log + private Todo spike. It is intentionally separate from the baseline runtime and repository client.

It provides:

- validation for a fixed private plugin repository and immutable commit SHA;
- project-base-aware virtual entry URL construction;
- strict virtual request parsing and GitHub Contents API mapping;
- SHA-scoped private cache names;
- Service Worker registration/controller acquisition; and
- credential-ready/credential-cleared message delivery.
- a credential bridge that extracts a shared PAT inside the framework adapter and sends it only to the worker; and
- a validated, revision-aware state capability over one fixed repository file.

`createPrivatePluginStateCapability()` closes over the host's repository client and fixed path. The remote receives only `load()` and `save(value, expectedRevision)`. Reads are decoded and validated, proposed writes are validated and deterministically formatted, the expected revision is passed as the GitHub blob SHA, and the returned content SHA becomes the next revision. Repository identity, path selection, credentials and arbitrary fetch access never cross into plugin props.

The package does not expose a GitHub token to a remote, make Module Federation authentication-aware, add plugins to the default Repo App manifest, or claim to sandbox same-origin code. An app still owns its root-scoped public worker file because GitHub Pages cannot add the `Service-Worker-Allowed` header needed to widen the scope of a hashed asset worker. Shared PAT reuse is limited to apps on the same browser origin and device; canonical repository state, not credential storage, is what synchronizes across devices.

See `docs/PRIVATE_PLUGIN_RUNTIME.md` for the tested integration sequence and promotion criteria.
