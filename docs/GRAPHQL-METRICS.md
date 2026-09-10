# GraphQL Metrics Widget exercise

The lab exposes a small read-only GraphQL-shaped endpoint at `POST /api/graphql`. It accepts a JSON body with a `query` field and returns aggregate account metrics read from SQLite.

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
      "usersByStore": [{ "storeId": "101", "users": 2 }]
    }
  }
}
```

This is intentionally a teaching-sized endpoint rather than a complete GraphQL server. It demonstrates the customer integration contract: the widget sends a query, the service reads data, and the response is shaped under `data`.
