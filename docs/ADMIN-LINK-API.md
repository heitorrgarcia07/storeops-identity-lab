# Administrative identity-link API

[Documentation index](README.md)

This endpoint associates an existing SCIM account with an Auth0 identity. It is a custom DemoMart administrative operation, not part of the SCIM standard.

## Prerequisites

- An existing SCIM-provisioned account.
- The verified Auth0 user ID for the intended person.
- A configured server `IDP_ISSUER`.
- A distinct `ADMIN_TOKEN` of at least 32 characters; reusing `SCIM_TOKEN` is rejected.

Credentials are supplied through deployment environment configuration. The API does not create users in Auth0 or independently verify ownership through the Auth0 Management API.

## Request

```http
POST {{baseUrl}}/api/admin/identity-links
Authorization: Bearer {{adminToken}}
Content-Type: application/json
```

```json
{
  "userId": "{{userId}}",
  "subject": "{{auth0UserId}}"
}
```

| Field | Meaning |
| --- | --- |
| userId | Account ID returned by the SCIM creation response |
| subject | Corresponding Auth0 database user ID, beginning with auth0\| |

The server uses its configured issuer; an issuer override is not accepted in the body. In Postman, use the administrative Bearer credential for this request rather than inherited SCIM authorization.

## Response contract

HTTP 200 returns `userId`, `issuer`, `subject` and `status: "linked"`. Repeating the same association succeeds without changing account ownership.

| Status | Meaning |
| --- | --- |
| 200 | Link established or identical link already present |
| 400 | Invalid request fields or JSON |
| 401 | Missing or incorrect administrative credential |
| 404 | Target account does not exist |
| 409 | Not SCIM-managed, already linked differently, or identity already assigned |
| 413 | Body exceeds the endpoint limit |
| 503 | Missing configuration or storage failure |

Only issuer and subject change. Profile, store, active status, account ID and SCIM representation remain intact. Conflicts do not trigger automatic merges.

## Verification and observability

Following a successful response, perform an SP-initiated login in a fresh browser session. The dashboard should show **SCIM account preserved — SAML sign-in** and the original account ID.

Server events `identity.linked` and `identity.link.rejected` report outcomes without logging credentials or request bodies. They support troubleshooting but are not a durable, per-operator audit trail.

Related: [Identity model](SCIM-SAML-LINKING.md), [SCIM API](SCIM-FIRST-EXERCISE.md).
