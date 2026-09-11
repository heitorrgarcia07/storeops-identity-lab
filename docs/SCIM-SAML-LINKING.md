# Identity lifecycle and account linking

[Documentation index](README.md)

DemoMart separates authentication from provisioning. A SAML identity establishes who signed in; a SCIM account owns the provisioned profile, store and active status.

## Identity model

| Identifier | Source | Purpose |
| --- | --- | --- |
| Account ID | DemoMart POST /scim/v2/Users | Stable application account reference |
| Subject | Auth0 user_id | Stable identity within the IdP |
| Issuer | Server IDP_ISSUER | Trusted identity provider |

New SCIM accounts use the reserved issuer `urn:storeops:unlinked-scim` and their account ID as a placeholder subject. Linking replaces those two identity fields while preserving the account ID, profile, store, status and SCIM representation.

Email equality does not establish a link. An administrator confirms that the two records represent the same person.

## Implementation sequence

1. Provision the DemoMart account through SCIM.
2. Create or identify the corresponding Auth0 user and configure its authorized application metadata.
3. Submit the link through the [administrative API](ADMIN-LINK-API.md).
4. Initiate SAML sign-in from DemoMart.
5. Verify the preserved account ID and provisioned attributes.

Complete linking before the first login for this identity. With JIT enabled, an unlinked identity may otherwise create a separate account.

## Ownership and conflict handling

The trusted identity key is the issuer/subject pair. The application refuses to take an identity from another account or replace an existing different identity. Identical link requests can be repeated safely.

For a linked SCIM account, subsequent SAML sign-ins do not overwrite its profile, store or active state. The Auth0 Action still requires application assignment and a valid store attribute to allow authentication.

The local SQLite script is a development utility; it is not a remote database administration mechanism. Hosted implementations use the administrative API.

## Acceptance matrix

| Scenario | Expected result |
| --- | --- |
| First login after linking | SCIM account preserved; same internal ID |
| Repeat identical link | Success; account data unchanged |
| Identity belongs to another account | Conflict; no merge |
| Different identity proposed for linked account | Conflict; no replacement |
| SCIM store differs from a valid Auth0 store attribute | SCIM store retained |
| SCIM active=false | New sign-in and protected dashboard requests blocked |
| SCIM active=true restored | Access possible again |

Deactivation does not erase a previously rendered browser page. It is enforced on subsequent protected requests. Reactivation may restore an unexpired session; permanent session revocation/versioning is not implemented.

See [SSO configuration](AUTH0-SETUP.md) and [demonstration acceptance](INTERVIEW-DEMO.md).
