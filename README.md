# StoreOps Identity Lab

## Watch a login

Open `/activity` in a second tab in the same browser, then start a fresh login from `/`.
The timeline polls once per second and shows backend events for that browser's latest login.
Expand “View these events as server logs” to read the structured events. The running terminal
also prints them. Auth0 authentication and Action execution are external steps, not internal
events observed by StoreOps. Timelines are in memory, expire after one hour, and reset on restart.
No passwords, raw assertions, email addresses, session cookies or SAML request tokens are recorded
in these new timeline events. Prior logins cannot be reconstructed.

Module 01: a local SAML service provider with Auth0 as identity provider and just-in-time account provisioning. Built for a retail technical implementation case study. This is an independent lab, not a Zipline integration.

## Run

Requires Node.js 24+, pnpm, and OpenSSL for tests.

```sh
pnpm install
pnpm setup
pnpm check
pnpm test
pnpm start
```

Open http://localhost:3000. Follow [the Portuguese Auth0 walkthrough](docs/AUTH0-SETUP.md).

On this machine, `scripts/local.sh start` uses the bundled Node runtime without installing Node globally. `scripts/local.sh check` and `scripts/local.sh test` run verification.

For a temporary public demo, `render.yaml` describes a free Render Web Service. Set the Auth0 values as environment variables in Render and update the Auth0 SAML ACS URL to the public `APP_BASE_URL`. Free Render storage is ephemeral, so the local SQLite data is suitable for demonstration only; do not treat it as persistent production storage.

## Scope

- SP-initiated SAML login; signed assertions verified by `@node-saml/node-saml`.
- Audience, issuer, validity, recipient and request correlation checks; browser-bound completion; one-time login requests.
- JIT creates SQLite accounts by `(issuer, NameID)`; repeat login preserves internal ID. Inactive accounts are not reactivated.
- The signed `storeId` determines store visibility. No user-selected store parameter.
- HTTP-only session cookie, one-hour local session, CSRF-protected local logout.
- Safe error references; no assertions, passwords or session tokens logged.

## Limits

Local HTTP only, loopback listener, one process, in-memory sessions and request cache. Restarting invalidates sessions and in-flight logins. SQLite accounts persist in `data/`.

SCIM creation and updates are described in [SCIM-FIRST-EXERCISE.md](docs/SCIM-FIRST-EXERCISE.md). Manual identity linking is available in [SCIM-SAML-LINKING.md](docs/SCIM-SAML-LINKING.md). The read-only Metrics Widget exercise is described in [GRAPHQL-METRICS.md](docs/GRAPHQL-METRICS.md). Linked SCIM accounts retain provisioning-managed profile, store and active status during SAML login. Automated IdP provisioning, general account migration, role administration, Single Logout and production deployment are not implemented. Auth0 access changes affect new logins, not existing local sessions. SCIM deactivation blocks protected requests while inactive, but reactivation can restore an unexpired session. Do not expose this lab through a public tunnel without adapting transport, cookies and deployment controls.

Automated tests use locally generated signed SAML fixtures. They do not prove that an Auth0 tenant is correctly configured; manual acceptance remains pending until an actual login succeeds.

## Files to study

- `src/config.js`: SAML trust configuration.
- `views/`: HTML pages. `public/style.css`: colors and layout.
- `src/pages.js`: fills HTML placeholders safely.
- `src/app.js`: login request, assertion callback, browser binding, session and dashboard.
- `src/identity.js`: JIT and identity persistence.
- `config/auth0-addon.json`: Auth0 protocol settings.
- `config/auth0-post-login-action.js`: application access and attribute mapping.
- `docs/AUTH0-SETUP.md`: guided setup and acceptance checks.

## References

- https://github.com/node-saml/node-saml
- https://auth0.com/docs/authenticate/single-sign-on/outbound-single-sign-on/configure-auth0-saml-identity-provider

The application now runs as plain JavaScript: no TypeScript compiler or tsx runtime. HTML templates and CSS are separate files.
