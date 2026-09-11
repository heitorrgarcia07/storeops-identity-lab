# PostgreSQL on Render

## Two independent environments

- Local application (`localhost:3000`): without `DATABASE_URL`, uses `data/storeops.sqlite` on your computer.
- Hosted application: with `DATABASE_URL`, uses the separate PostgreSQL service. It does not read your computer's SQLite file.

Set `DATABASE_URL` in the Render **web service**, using the database's **Internal Database URL**. Both services must be in the same region. Never commit the connection URL: it includes a password.

After deploying the updated code, look for this startup log:

```json
{"event":"database.ready","database":"PostgreSQL"}
```

The server creates `users` and `scim_resources` if they do not already exist. Existing PostgreSQL rows are preserved. A connection failure stops startup; it does not silently fall back to SQLite.

## Existing accounts

This change does not copy data from either SQLite database. PostgreSQL starts empty unless already populated. Recreate fictional SCIM accounts with Postman and record the new IDs. For an account that will be SCIM-managed, link its Auth0 identity before attempting SAML login, to avoid creating a separate JIT account.

The existing `scripts/link-identity.mjs` remains a local SQLite tool. It does not edit the Render database.

## Acceptance checks

1. Confirm `database.ready` says `PostgreSQL` in Render logs.
2. With the Render environment in Postman, POST a fictional SCIM user and confirm 201. Save the returned ID in the environment variable.
3. GET the same account; confirm 200 and the same ID.
4. PATCH active to false and true; check the metrics widget after each change.
5. Sign in using a separate JIT test identity and confirm the dashboard opens.
6. Redeploy the same application code. The browser session ends, but GET must still return the same SCIM account ID and values.

Render's free PostgreSQL database expires after 30 days. Persistence across application restarts is not a backup or an exemption from that expiry. Export the demo data before the database expires.

## Viewing with SQL

A desktop PostgreSQL client connects using the **External Database URL**, with TLS enabled. This differs from the internal URL used by the application. The database's network access rules must allow your connection. DB Browser for SQLite cannot open PostgreSQL.

Once connected, these queries are read-only:

```sql
SELECT id, email, name, store_id, active, issuer, subject
FROM users
ORDER BY name;

SELECT user_id, user_name, resource
FROM scim_resources
ORDER BY user_name;
```

`active` remains an integer (0 or 1), matching the local lab. The API exposes it as a boolean. The SCIM `resource` column stores its JSON representation as text, so both tables must be kept consistent when changing provisioning fields.

## Code and verification

- `src/postgres.js`: PostgreSQL queries, schema initialization and transactions, using the `pg` driver.
- `src/sqlite-scim.js`: local SQLite SCIM storage.
- `src/server.js`: selects storage based on `DATABASE_URL`.
- `src/app.js` and `src/scim.js`: await database results before sending responses.

`./scripts/local.sh test` includes SQLite/SAML regression tests and PostgreSQL SQL tests using PGlite, an embedded PostgreSQL engine. These exercise rollback, account linking, metrics, provisioning and data persistence after closing/reopening a test database. They do not verify Render networking, TLS or credentials; the acceptance checks above do that.

The metrics endpoint uses GraphQL.js and a read-only schema; see [GRAPHQL-METRICS.md](GRAPHQL-METRICS.md). The same resolver interface supports PostgreSQL and SQLite.
