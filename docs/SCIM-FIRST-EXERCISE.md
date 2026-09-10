# SCIM exercise 01 — create Ana before login

This is a manual provisioning client calling a small SCIM 2.0 API subset. It is not an automated Auth0 provisioning integration or a complete SCIM implementation.

## Run locally

1. `./scripts/local.sh setup-scim` generates a token in `.env` without printing it.
2. Restart the server with `./scripts/local.sh start`.
3. In another terminal, run `./scripts/local.sh create-ana`.

The last command reads `config/ana-scim.json`, sends it to `POST /scim/v2/Users`, and retrieves the resulting account with GET. A new account returns **201 Created** and a `Location` header. Repeating creation returns **409 Conflict**; the script then looks up and reads the existing account. It never logs in as Ana.

## Field mapping

| SCIM | Local SQLite account |
|---|---|
| Server-generated `id` | `users.id` |
| `displayName` | `users.name` |
| First `emails[].value` | `users.email` |
| Enterprise `department` | `users.store_id` (lab mapping: 101 or 102) |
| `active` | `users.active` |

`externalId` and the SCIM representation are stored in `scim_resources`. The shared `users` table stores the operational account. Creation of both records occurs in one transaction.

## Identity linking is a separate exercise

New SCIM accounts initially use the reserved issuer `urn:storeops:unlinked-scim`. Creation does not create an Auth0 user, grant access in Auth0 or automatically link accounts by email. Follow [SCIM-SAML-LINKING.md](SCIM-SAML-LINKING.md) to explicitly link an Auth0 identity to an existing SCIM account. Until linked, do not attempt SAML login as that user, as JIT may create a separate account.

## What is observable

The terminal server emits `scim.create.received`, `scim.user.created`, `scim.user.read` and rejection events. The client command displays the fictional payload, HTTP status and persisted response. The `/activity` browser timeline remains specific to SAML logins; SCIM requests have no browser session.

## Scope and security

Bearer token authentication, localhost only, create/read users, case-insensitive userName uniqueness, userName equality filter and basic pagination. PATCH supports explicit-path `replace` for enterprise `department` (101 or 102) and boolean `active`. Other PATCH operations and attributes, PUT, groups, schema discovery, automatic IdP provisioning and production deployment are not implemented. A valid token is required for reads as well as writes. The token must not be committed or pasted into screenshots.

## Exercise 02 — update with Postman

Restart the server in your VS Code terminal after changing the code. Select PATCH on the same `/scim/v2/Users/{id}` URL used for GET. Keep Bearer Token authorization, choose Body → raw → JSON, and paste `config/patch-store.json` to transfer the user to store 101.

Expected response: 200 OK, same id and creation time, updated department and lastModified. A following GET and the SQLite users table must both show the new store. Server logs include `scim.patch.received` and `scim.user.updated`. Repeating an unchanged value returns 200 and `scim.user.unchanged`.

For deactivation, use the same PatchOp envelope with one operation: `{"op":"replace","path":"active","value":false}`. This updates the local account only; it does not modify Auth0 or establish a SAML identity link. The entire PATCH is rejected if any operation is invalid. Database writes are transactional.

References: https://www.rfc-editor.org/rfc/rfc7643 and https://www.rfc-editor.org/rfc/rfc7644.
