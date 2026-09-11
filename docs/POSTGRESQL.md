# Data architecture and deployment

[Documentation index](README.md)

StoreOps supports PostgreSQL for the hosted demonstration and SQLite for local development. The application chooses its storage backend at startup.

## Environment model

| Environment | Configuration | Storage |
| --- | --- | --- |
| Hosted | DATABASE_URL configured | Separate PostgreSQL service |
| Local development | DATABASE_URL absent | data/storeops.sqlite within the local project |

The two environments do not synchronize data. Selecting PostgreSQL does not import existing SQLite accounts. A failed PostgreSQL connection stops startup rather than silently switching storage.

## Hosted configuration

Set `DATABASE_URL` on the Render web service using the database's Internal Database URL. Both services must share a region for the private connection. The connection string contains credentials and belongs in environment configuration, not source control.

Successful initialization logs:

```json
{"event":"database.ready","database":"PostgreSQL"}
```

Startup creates the required tables and index if absent, preserving existing PostgreSQL rows. Accounts persist independently of application restarts, subject to the database service's lifecycle and retention policy.

## Data model

| Table | Responsibility |
| --- | --- |
| users | Operational account, identity mapping, profile, store and active status |
| scim_resources | SCIM username and complete provisioned resource representation |

The PostgreSQL schema enforces unique issuer/subject pairs, a foreign key from SCIM resources to accounts, and case-insensitive SCIM username uniqueness. Provisioning writes use transactions across both tables.

`users.active` is stored as 0 or 1; the SCIM API exposes a boolean. The SCIM resource is stored as JSON text. Provisioning changes should use the API to keep both representations consistent.

## Operational verification

1. Confirm the PostgreSQL startup event.
2. Create and retrieve a SCIM account, recording its ID.
3. Update active status and confirm matching API and metrics results.
4. Redeploy the application and retrieve the same account ID.
5. Verify authentication again; sessions are in memory and reset on restart.

The free database service has a scheduled expiry. Confirm the date in the provider dashboard and export demonstration data before expiry. Persistence across application restarts does not constitute a backup.

## Read-only inspection

An authorized desktop PostgreSQL client uses the External Database URL with TLS, subject to database network access rules. This differs from the internal connection used by the hosted application.

```sql
SELECT id, email, name, store_id, active, issuer, subject
FROM users
ORDER BY name;

SELECT user_id, user_name, resource
FROM scim_resources
ORDER BY user_name;
```

Database credentials should not appear in screenshots, shared query files or repository contents.

## Implementation and tests

[PostgreSQL storage](../src/postgres.js) manages parameterized queries and transactions. [Server startup](../src/server.js) selects the backend. Local SQL tests use the PGlite PostgreSQL engine and cover persistence, rollback and identity behavior; hosted networking and credentials require deployment acceptance.

Related: [SCIM API](SCIM-FIRST-EXERCISE.md), [GraphQL metrics](GRAPHQL-METRICS.md).
