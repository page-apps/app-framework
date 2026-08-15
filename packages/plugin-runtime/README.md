# Experimental private plugin runtime

`@repo-apps/plugin-runtime` contains the host-side contracts proven by the Quick Log + private Todo spike. It is intentionally separate from the baseline runtime and repository client.

It provides:

- validation for a fixed private plugin repository and immutable commit SHA;
- project-base-aware virtual entry URL construction;
- strict virtual request parsing and GitHub Contents API mapping;
- SHA-scoped private cache names;
- Service Worker registration/controller acquisition; and
- credential-ready/credential-cleared message delivery.

The package does not expose a GitHub token to a remote, make Module Federation authentication-aware, add plugins to the default Repo App manifest, or claim to sandbox same-origin code. An app still owns its root-scoped public worker file because GitHub Pages cannot add the `Service-Worker-Allowed` header needed to widen the scope of a hashed asset worker.

See `docs/PRIVATE_PLUGIN_RUNTIME.md` for the tested integration sequence and promotion criteria.
