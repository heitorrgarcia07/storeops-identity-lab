# Interview demo flow

## Scenario

StoreOps is a fictional retail operations application. A customer needs SSO for store employees, automated account lifecycle management, and a metrics widget.

## Demonstration

1. **SAML login and JIT** — The browser starts SAML with Auth0. StoreOps validates the signed response, checks issuer, audience, recipient, timing and request correlation, then creates or preserves a local account.
2. **SCIM provisioning** — Postman represents an enterprise provisioning client. `POST /scim/v2/Users` creates an account before login; `PATCH` changes the store or active status. SQLite persists both the operational account and the SCIM representation.
3. **Identity linking** — An administrator explicitly links the Auth0 subject to the existing SCIM account. A later SAML login authenticates the person while SCIM remains the source of truth for profile, store and active status.
4. **GraphQL metrics** — The Metrics Widget sends a read-only query to `POST /api/graphql`. StoreOps reads aggregate values from SQLite and returns them under `data`. Deactivating a user with SCIM and refreshing the widget makes the change visible.

## Interview explanation

> “I separated authentication, provisioning and data consumption. SAML proves who the user is, SCIM manages the account lifecycle, and the local database stores the operational state. A small GraphQL contract then exposes aggregate metrics to a widget. I also made the failure paths observable through safe, structured events without logging assertions, cookies or credentials.”

## Design decisions to mention

- SCIM-managed accounts are not overwritten by later SAML logins.
- Account IDs remain stable when email or display names change.
- Deactivation blocks access even when JIT is enabled.
- Identity linking is explicit and refuses conflicts or silent merges.
- The GraphQL endpoint is intentionally read-only and teaching-sized.
