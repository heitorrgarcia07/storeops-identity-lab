# GraphQL Metrics Widget exercise

The lab exposes a read-only GraphQL endpoint at `POST /api/graphql`, implemented with GraphQL.js. It validates requests against the schema in `src/metrics-graphql.js` and returns only the requested fields. The resolver reads PostgreSQL on Render or SQLite locally.

Example request:

```json
{
  "query": "query MetricsWidget { metrics { totalUsers activeUsers inactiveUsers usersByStore { storeId users } } }"
}
```

Example response:

```json
{
  "data": {
    "metrics": {
      "totalUsers": 3,
      "activeUsers": 3,
      "inactiveUsers": 0,
      "usersByStore": [{ "storeId": "101", "users": 2 }, { "storeId": "102", "users": 1 }]
    }
  }
}
```

## Observe field selection in Postman

Keep the method POST and Body raw/JSON. Send:

```json
{"query":"{ metrics { activeUsers } }"}
```

Only `data.metrics.activeUsers` is returned. Add `totalUsers` to the selection and it appears in the response. Request `unknownCount` instead and GraphQL returns a validation error without reading the database.

The existing widget still requests all four metric fields. It checks both HTTP failures and the GraphQL `errors` array.

## Schema and resolver

- Schema: defines `Query.metrics`, the three integer counts, and `usersByStore` with `storeId` and `users` fields.
- Resolver: calls the existing `users.metrics()` method. One database snapshot is reused per request, including queries with multiple aliases.
- GraphQL.js: parses, validates, and executes the query, selecting the requested response fields. Named operations, variables, directives, aliases and fragments are supported.

Body fields: `query` (required string), `variables` (optional object), `operationName` (optional string). Invalid requests/validation return HTTP 400 with `errors`. Execution errors return HTTP 200 with `data` and `errors`; storage failure messages are sanitized.

This is a small real GraphQL implementation, with only a read-only query schema. There are no mutations or subscriptions. The endpoint exposes aggregate lab counts publicly; it is not a store-scoped authorization API and exposes no account email or identity fields. Query text is limited to 12,000 characters, and the existing HTTP body limit still applies. Field selection controls the JSON response, not which aggregate SQL columns are calculated.

Reference: https://github.com/graphql/graphql-js
