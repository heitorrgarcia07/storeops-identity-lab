# SAML SSO configuration

[Documentation index](README.md)

DemoMart acts as a SAML service provider (SP), with Auth0 as the identity provider (IdP). This guide covers an SP-initiated sign-in integration for the demonstration environment.

## Configuration responsibilities

| Owner | Configuration |
| --- | --- |
| Identity administrator | Auth0 application, SAML addon, user assignment and Post Login Action |
| Application administrator | Trusted issuer, signing certificate, callback URL and SP entity ID |
| Implementation team | Attribute mapping, identity linking and acceptance verification |

## Service provider settings

Define the application environment before configuring Auth0:

| Setting | Purpose |
| --- | --- |
| `APP_BASE_URL` | Application origin; HTTPS for the hosted environment |
| `SP_ENTITY_ID` | SP identifier; must match the SAML audience |
| ACS URL | `<APP_BASE_URL>/auth/saml/acs` |
| `IDP_SSO_URL` | Identity Provider Login URL supplied by Auth0 |
| `IDP_ISSUER` | Exact issuer supplied by Auth0 |
| `IDP_CERT_PEM` | Complete public signing certificate in PEM format |
| `IDP_CERT_PATH` | Alternative path to a PEM file for local development |
| `JIT_ENABLED` | Whether an authorized first login may create an account |

The supplied SP entity ID is `urn:storeops:local`. Despite its name, it is an identifier and may be retained for the hosted demo when both sides agree. The callback must use the actual environment URL.

## Auth0 application

Create a Regular Web Application with the SAML2 Web App addon and enable its database connection. Use [the addon template](../config/auth0-addon.json) as the starting configuration.

Set the Application Callback URL, JSON `recipient` and JSON `destination` to the environment's ACS URL. The template contains localhost values that must be replaced for hosted use. Set `audience` to the configured SP entity ID.

The template uses a persistent NameID derived from Auth0's stable user ID, RSA-SHA256 signatures and SHA-256 digests. DemoMart requires a signed assertion; a response signature is not required by this configuration.

## Assignment and attribute mapping

Create and deploy [the Post Login Action](../config/auth0-post-login-action.js), attach it to the login flow, and set its `STOREOPS_CLIENT_ID` secret to the application's Client ID. This is an identifier, not the Client Secret.

Assign a fictional demonstration user through administrator-controlled `app_metadata`:

```json
{
  "storeops_access": true,
  "storeId": "101"
}
```

The Action requires an assigned user and store `101` or `102`, then sets `email`, `displayName` and `storeId`. For SCIM-managed accounts, DemoMart preserves the provisioned profile and store after authentication. For JIT accounts, it uses the mapped attributes.

Copy the issuer, login URL and signing certificate from the addon configuration into the application environment. No Auth0 Management API credential or signing private key is required.

## Acceptance criteria

- Start sign-in from DemoMart, rather than an IdP-initiated test.
- An assigned user reaches the dashboard with the expected account and store.
- Repeat sign-in preserves the account ID.
- A linked SCIM account displays **SCIM account preserved — SAML sign-in**.
- A new user cannot be created when JIT is disabled.
- Invalid signatures, audience, issuer, timing or request correlation are rejected.

For a provisioned account, complete [identity linking](SCIM-SAML-LINKING.md) before its first SAML login. Otherwise, JIT may create a separate account.

## Operational behavior

Auth0 and DemoMart maintain separate sessions. Local logout does not end the Auth0 session. Auth0 assignment changes apply to new authentication attempts; SCIM deactivation also blocks protected DemoMart requests. Session state resets on application restart.

The login timeline at `/activity` records DemoMart-observed events for the same browser context. It does not expose Auth0's internal authentication steps.

Implementation: [SAML configuration](../src/config.js), [login routes](../src/app.js).
