# BigQuery sales snapshots

The local JavaScript runner reads sales from PostgreSQL and invokes Google's `bq` CLI to submit a batch load job. It replaces `sales_usd`, then checks row count, unique IDs and revenue against the extracted snapshot. No manual CSV upload, Cloud Storage bucket, streaming or DML is involved.

## Setup

1. Install the [Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install), including `bq`. Run `gcloud auth login` with the account that owns the sandbox project. This runner uses CLI authentication, not Application Default Credentials or a downloaded service-account key.
2. Copy `config/bigquery.env.example` to `.env.bigquery` in the repository root (gitignored).
3. Set `SYNC_DATABASE_URL` to the Render PostgreSQL **external** connection URL with TLS. This is a separate setting from the application's database. Prefer a SELECT-only database account.
4. Set `BQ_PROJECT_ID` to the project **ID**, not its display name. Set the existing dataset and its actual location (`US` in the example).
5. The Google identity needs permission to create load/query jobs in the project and write/read the destination dataset: typically BigQuery Job User at project scope and BigQuery Data Editor at dataset scope. Use the existing project; no billing activation is required for sandbox batch loads within its limits.

## Run

```sh
npm run sync:bigquery
```

This reads the source and previews the exact destination, counts and revenue in integer cents. It does not contact BigQuery.

```sh
npm run sync:bigquery -- --apply
```

This **replaces all data in the selected dataset's `sales_usd` table** with the extracted sales. Do not use a table containing other data. The source database and the old BRL exercise table are unchanged. A successful run ends with `sync.verified`. The browser's sales list is limited to 100 rows; this runner reads the source table directly, with a 10000-row lab safety limit. Empty or oversized sources are rejected before uploading.

## Behavior and limits

- Repeating a full load does not append duplicates. An advisory lock serializes these scripts against the same PostgreSQL source. External writers and other source databases are not coordinated: designate this runner as the only writer to this destination.
- The snapshot comes from one SELECT. Sales created afterward are included next time. Reconciliation compares the warehouse with that snapshot, not a newer database state.
- A private temporary NDJSON file is generated automatically and removed on normal completion/failure. Only sale ID, date, store and USD amount are transferred; employee identities are excluded. A process kill may leave the temporary file in the OS temporary directory.
- A failed load does not produce `sync.verified`. A reconciliation failure happens **after** the load and does not roll it back. If a CLI call times out, check BigQuery Job history before rerunning; a remote job might still be active.
- This is an on-demand local runner, not a hosted scheduler or incremental connector. `gcloud` and `bq` must be installed on the machine executing it. It is not added to Render startup.
- Sandbox limits still apply, including automatic table expiration and storage/query quotas. See [sandbox limitations](https://docs.cloud.google.com/bigquery/docs/sandbox) and [batch loads](https://docs.cloud.google.com/bigquery/docs/batch-loading-data).

## Demonstration

Record a fictional sale in DemoMart, preview the snapshot, run with `--apply`, and query `sales_usd` in BigQuery. Repeat the same synchronization and confirm unchanged counts and revenue. This demonstrates extraction, batch loading, repeatability and reconciliation.

[Back to documentation](README.md)
