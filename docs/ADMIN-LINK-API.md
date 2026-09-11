# Link a SCIM account to Auth0 from Postman

This is a custom administrative API, not a standard SCIM operation. It replaces the manual SQL step. It does not create an Auth0 account or verify ownership through Auth0: the administrator must obtain the correct User ID from Auth0 and confirm it belongs to the intended person.

## Configure

Generate a new credential locally with `openssl rand -hex 32`. Store it as `ADMIN_TOKEN` in Render and as `adminToken` in the Postman Render environment. Never reuse `SCIM_TOKEN`. Do not commit or share either token. Deploy the updated application.

Create a request:

```text
POST {{baseUrl}}/api/admin/identity-links
```

Override collection authorization for this request: **Bearer Token** `{{adminToken}}`. Body: **raw / JSON**:

```json
{
  "userId": "{{userId}}",
  "subject": "{{auth0UserId}}"
}
```

Set `auth0UserId` in the selected environment to the correct Auth0 `user_id`. The server takes the issuer from its own `IDP_ISSUER`; callers cannot override it.

## Results

- 200: linked, or the identical link already exists (safe to repeat).
- 400: invalid fields or body.
- 401: missing or incorrect administrative credential. SCIM credentials alone do not authorize linking.
- 404: account does not exist.
- 409: account is not SCIM-managed, already has another identity, or the proposed identity belongs to another account.
- 503: configuration or database failure.

Successful responses contain `userId`, `issuer`, `subject` and `status: "linked"`. Profile, store, active state, account ID and SCIM representation are preserved. No automatic merging or relinking is permitted. Terminal events `identity.linked` and `identity.link.rejected` log outcomes without request bodies or credentials. These logs are not a durable administrative audit database.

## Final guided demo

1. POST a fictional SCIM user (201); the collection script saves its ID in the Render environment.
2. Create the corresponding Auth0 database user, set `storeops_access: true` and a valid `storeId` in app_metadata; copy its User ID into `auth0UserId`.
3. POST the identity link (200). Repeating the same call must still succeed.
4. Sign in in a private browser window. Confirm the SCIM-preserved result and same account ID.
5. PATCH active=false through SCIM; refresh the dashboard to observe access blocked, and refresh metrics to see the inactive count.
6. PATCH active=true and restore access.
7. Once before the interview, redeploy the same code and GET the same user ID to verify PostgreSQL persistence. Sessions reset; database accounts remain.

The identity demo is complete after this hosted acceptance run. No additional module is necessary for that story. The metrics endpoint now uses GraphQL.js with a read-only schema and honors field selection; see GRAPHQL-METRICS.md for the data demo. Auth0 user creation and authorization metadata are still manual; Postman simulates the provisioning client. The demo is not a production deployment. Export data before the free database expires.
