# Solution overview

[Documentation index](README.md)

DemoMart is a fictional retail team portal connecting employee authentication, account lifecycle management and operational metrics.

## System responsibilities

| Component | Responsibility |
| --- | --- |
| Auth0 | Authenticate assigned users and issue signed SAML assertions |
| DemoMart | Validate identity, enforce account state and serve the portal |
| SCIM client | Create accounts and update store or active status |
| Administrative API | Link a verified Auth0 identity to a provisioned account |
| PostgreSQL | Persist hosted accounts and SCIM representations |
| GraphQL API | Supply aggregate metrics to the widget |

Postman acts as the SCIM client in this reference implementation. Auth0 account creation and application assignment are managed separately.

## Account lifecycle

### First-login provisioning

With JIT enabled, a first authorized SAML login creates an application account. Subsequent logins preserve its internal ID and refresh mapped profile attributes. Disabling JIT prevents new account creation through this path.

### Provisioning before login

A SCIM request creates the account in advance. An administrator links it to the corresponding Auth0 subject. The subsequent SAML login authenticates the identity without replacing SCIM-managed profile, store or active status.

Linking uses the issuer and subject rather than matching email addresses. Conflicting associations are rejected; accounts are not silently merged.

### Deactivation and restoration

A SCIM update to inactive blocks new sign-in and subsequent protected dashboard requests. Restoring active status allows access again. The same account ID is retained throughout.

A previously rendered page is not remotely erased. Deactivation does not permanently invalidate existing sessions; an unexpired session may become usable again after reactivation.

## Reporting and observability

The widget requests metrics through a typed GraphQL schema. Counts include JIT and SCIM accounts, with field selection determining the response. Undefined fields are rejected before accessing storage.

The browser login timeline exposes events observed by DemoMart, while server logs report provisioning, linking and query outcomes. Auth0's internal authentication steps are outside the timeline. Credentials, raw assertions and session cookies are excluded from these events.

## Persistence and verification

PostgreSQL stores hosted account data separately from the web process. Application restarts clear in-memory sessions and login state but preserve database accounts, subject to the database service's retention policy.

Automated tests cover signed SAML validation, JIT behavior, SCIM transactions, administrative linking and GraphQL execution. PostgreSQL tests use PGlite; external Auth0 configuration and hosted connectivity require environment-specific verification.

## Implementation boundaries

- SCIM includes create, read, limited filtering and pagination, and supported PATCH replace operations.
- Automatic IdP-to-SCIM synchronization, groups and general account migration are not implemented.
- Local logout does not end the Auth0 session; Single Logout is not implemented.
- The application runs as one process with in-memory session and request state.
- Metrics are public aggregate data and are not restricted to the signed-in user's store.
- GraphQL exposes queries only; there are no mutations or subscriptions.
- The project is a reference application, not a production identity service.

[SSO configuration](AUTH0-SETUP.md) · [SCIM API](SCIM-FIRST-EXERCISE.md) · [Linking API](ADMIN-LINK-API.md) · [Metrics API](GRAPHQL-METRICS.md)
