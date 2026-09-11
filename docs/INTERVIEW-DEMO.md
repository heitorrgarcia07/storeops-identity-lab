# Solution demonstration and acceptance

[Documentation index](README.md)

## Business scenario

A fictional retail organization requires consistent employee onboarding, single sign-on, store assignment and access removal. DemoMart demonstrates how these requirements connect across identity, provisioning and reporting services.

The implementation uses Auth0 for SAML authentication, SCIM endpoints for account lifecycle management, an administrative identity-link API, and GraphQL for aggregate account metrics.

## Demonstration prerequisites

The implementation owner prepares a fictional account, authorized Auth0 application access and a provisioning client. Administrative panels and credentials remain with the owner; a reviewer can use the assigned test login.

Postman represents an enterprise provisioning client. The demo does not claim automatic synchronization from an IdP. Hosted data is stored in PostgreSQL independently of the web process.

## Demonstration sequence

| Stage | Action | Observable outcome |
| --- | --- | --- |
| Provision | POST a new SCIM account | HTTP 201 with a stable account ID |
| Associate | Link the Auth0 subject through the administrative API | HTTP 200; no duplicate account |
| Authenticate | Sign in through Auth0 in a fresh browser session | SCIM-preserved dashboard result and matching ID |
| Revoke | PATCH active=false and refresh the dashboard | Access blocked; inactive count increases |
| Restore | PATCH active=true | Access restored; counts reflect the current state |
| Select data | Request only activeUsers through GraphQL | Only the selected field is returned |
| Validate contract | Request an undefined GraphQL field | Validation error before a database read |

This sequence is designed for a 5–7 minute walkthrough. Creating the Auth0 identity and assigning metadata are administrator-managed steps.

## Supporting evidence

- The login timeline at `/activity` shows validation and account recognition in the same browser context as sign-in.
- Server logs show provisioning, linking and GraphQL outcomes.
- API responses expose account IDs, status codes and selected metrics.
- A read-only database query can confirm persistence and identity mapping.
- A redeploy followed by GET of the same account verifies storage independence. Browser sessions reset on restart.

## Acceptance criteria

The same provisioned account remains associated with its identity throughout the lifecycle. Deactivation prevents protected access, reactivation preserves the account, and reporting reflects current state.

Automated tests cover protocol rejection paths, linking conflicts, transactional rollback and GraphQL validation. Hosted acceptance also depends on correct Auth0 configuration and database connectivity.

## Scope boundaries

This is an independent implementation case study, not a production identity platform or an official Zipline integration. Automated IdP provisioning, general account migration, groups, Single Logout and permanent session revocation are outside the implemented scope. Metrics are public aggregate demonstration data, not a store-authorized reporting service.

[SSO configuration](AUTH0-SETUP.md) · [SCIM API](SCIM-FIRST-EXERCISE.md) · [Linking API](ADMIN-LINK-API.md) · [Metrics API](GRAPHQL-METRICS.md)
