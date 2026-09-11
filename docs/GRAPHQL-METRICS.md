# GraphQL metrics API

[Documentation index](README.md)

The read-only metrics API supplies account totals to the DemoMart widget. GraphQL.js validates queries against an explicit schema and returns the fields selected by the client.

## Request contract

```http
POST {{baseUrl}}/api/graphql
Content-Type: application/json
```

| Body field | Type | Requirement |
| --- | --- | --- |
| query | String | Required; maximum 12,000 characters |
| variables | Object | Optional |
| operationName | String | Optional; selects a named operation |

## Schema

```graphql
type Query {
  metrics: Metrics!
}

type Metrics {
  totalUsers: Int!
  activeUsers: Int!
  inactiveUsers: Int!
  usersByStore: [StoreCount!]!
}

type StoreCount {
  storeId: String!
  users: Int!
}
```

Counts include JIT and SCIM accounts. Store counts include both active and inactive users; stores without accounts are omitted. No store filter is defined.

## Field selection

```json
{
  "query": "{ metrics { activeUsers } }"
}
```

Illustrative response:

```json
{
  "data": {
    "metrics": {
      "activeUsers": 4
    }
  }
}
```

To request store counts, select the nested fields:

```json
{
  "query": "{ metrics { totalUsers usersByStore { storeId users } } }"
}
```

Named operations, variables, directives, aliases and fragments are supported. Unknown fields are rejected before the resolver reads the database.

## Execution and errors

The resolver calls the storage backend's metrics method. PostgreSQL serves the hosted application; SQLite serves local development. A single metrics result is reused within each request, including aliases.

| Result | HTTP status | Response |
| --- | --- | --- |
| Valid query | 200 | data containing selected fields |
| Invalid request or validation failure | 400 | errors |
| Resolver failure | 200 | data and errors; data may be null |

Clients must inspect the GraphQL errors array as well as HTTP status. Database failure details are sanitized. The widget implements both checks.

Field selection controls response fields; it does not dynamically optimize SQL calculations. The schema supports queries only, with no mutations or subscriptions.

## Access scope and observability

The endpoint exposes aggregate demonstration counts without authentication. It does not expose individual identity fields and is not scoped to the signed-in user's store.

Server events report query receipt, completion and rejection without logging raw queries or database errors.

Implementation: [schema and resolver](../src/metrics-graphql.js), [browser client](../public/metrics.js), [widget view](../views/metrics.html).
