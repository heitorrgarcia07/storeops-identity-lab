# SCIM provisioning API

[Documentation index](README.md)

The provisioning API creates and maintains DemoMart accounts independently of browser authentication. The demonstration uses Postman as the provisioning client; automated IdP provisioning is not configured.

## Endpoint and authentication

Base path: `{{baseUrl}}/scim/v2`.

Every request requires `Authorization: Bearer {{scimToken}}`. The server compares the credential with `SCIM_TOKEN`. JSON request bodies may use `application/scim+json` or `application/json`.

| Method and path | Behavior |
| --- | --- |
| POST /Users | Create an account and SCIM representation atomically |
| GET /Users | List provisioned accounts |
| GET /Users/{id} | Read a provisioned account |
| PATCH /Users/{id} | Replace supported store or active fields |

## Create an account

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "externalId": "demo-employee-001",
  "userName": "employee.demo@example.com",
  "displayName": "Demo Employee",
  "active": true,
  "emails": [{"value": "employee.demo@example.com"}],
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "101"
  }
}
```

A successful request returns HTTP 201, the generated `id`, and a `Location` header. Duplicate usernames are rejected case-insensitively with 409. The username, display name, one email and a supported department are required; active defaults to true.

| SCIM attribute | Application storage |
| --- | --- |
| id | users.id |
| displayName | users.name |
| emails[0].value | users.email |
| Enterprise department | users.store_id; supported values 101 and 102 |
| active | users.active |
| externalId and full representation | scim_resources.resource |

Creating a DemoMart account does not create an Auth0 user or establish an identity link. JIT-only accounts are excluded from SCIM reads by this implementation.

## Update access

Send the following body to `PATCH /Users/{{userId}}`:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {"op": "replace", "path": "active", "value": false}
  ]
}
```

Use true to restore access. To change stores, use path `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department` with string value `"101"` or `"102"`.

Successful updates return 200, preserving the ID and creation time. Invalid operations reject the entire request. Account and SCIM representation writes are transactional. Repeating an unchanged update returns the existing representation.

## Listing and errors

Listing supports `filter=userName eq "employee.demo@example.com"`, `startIndex` from 1 and `count` from 0 to 100. URL-encode query parameters when sending requests.

| Status | Meaning |
| --- | --- |
| 400 | Invalid schema, attributes, filter or operations |
| 401 | Missing or invalid provisioning credential |
| 404 | SCIM account not found |
| 409 | Duplicate username |
| 500 / 503 | Storage failure or unavailable configuration |
| 501 | Unsupported route or operation |

This is a SCIM subset. Groups, PUT, deletion, schema discovery and general PATCH operations are not implemented. Deactivation affects DemoMart access; it does not disable the Auth0 identity.

Server events report creation, reads, updates and rejections. The browser login timeline is separate from these API events.

Next: [Identity lifecycle and linking](SCIM-SAML-LINKING.md).
