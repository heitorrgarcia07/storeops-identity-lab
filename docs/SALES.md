# Store sales

Signed-in employees can open **Sales** from their dashboard to record fictional transactions and view up to 100 sales for their assigned store, ordered by sale date.

The browser submits a sale to Express, which validates it, derives the store from the current account, and saves it to PostgreSQL on the hosted application (SQLite by default locally). The list refreshes after confirmation.

## API

Both endpoints require an active browser session. SCIM and administrative bearer tokens do not grant access to sales.

| Request | Behavior |
| --- | --- |
| `GET /api/sales` | Returns `store_id`, `sales` and `limit: 100`. No query parameters. |
| `POST /api/sales` | Creates a sale; requires the session's `X-CSRF-Token` from the Sales form. |

Example creation body:

```json
{
  "sale_id": "f21fa188-3970-40ac-91a1-9570c61c56eb",
  "sale_date": "2026-09-11",
  "amount_usd": "50.00"
}
```

The browser generates a UUID for each sale. Amounts are positive decimal strings with at most two decimal places, up to `9999999.99` USD. The server supplies `store_id` and records the creator internally. PostgreSQL uses `DATE` and `NUMERIC`; SQLite stores the amount as integer cents.

New sales return **201**; identical retries by the same account return **200** without another insertion. Reusing an ID with different data or another account returns **409**. Invalid input returns **400**, missing/inactive sessions **401**, invalid CSRF tokens **403**. The form retains an uncertain request for safe retry while the page remains open.

Every request checks current account activity and store assignment. SCIM deactivation blocks further sales access; reassignment changes which store the account can access. Historical sales remain assigned to their original store.

## Scope

All fictional sales use USD. On startup, PostgreSQL automatically renames the legacy `amount_brl` column to `amount_usd`, preserving sale IDs and numeric values. This relabels demo data; it does not convert exchange rates. API callers must now send `amount_usd`. SQLite retains its currency-neutral integer cents column.

Sales are immutable in this version: no edits, refunds or deletion. The page total covers only the displayed rows. GraphQL metrics still describe accounts, not sales. An optional [local BigQuery runner](BIGQUERY-SYNC.md) refreshes sales snapshots on demand; there is no scheduled synchronization.

[Back to documentation](README.md)
