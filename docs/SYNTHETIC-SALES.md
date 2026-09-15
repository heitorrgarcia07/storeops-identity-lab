# Synthetic sales dataset

An optional, deterministic interview dataset adds 1000 fictional USD sales dated June 14–September 11, 2026. Store 101 receives 620 transactions; store 102 receives 380 with a higher expected average ticket. Weighted date selection models weekend activity, growth and a short downturn. These are simulated patterns, not real retail findings.

Run locally using the external PostgreSQL connection in `.env.bigquery`:

```sh
node scripts/seed-sales.mjs
node scripts/seed-sales.mjs --apply
node scripts/sync-bigquery.mjs --apply
```

The first command previews; the second inserts within a transaction. IDs prefixed `demo-sales-v1-` identify the synthetic batch. Repeating the same batch skips identical records and rejects conflicting values without overwriting existing sales. Each store needs an active account to satisfy the sale creator relationship; the script attributes synthetic records to one existing active account per store without creating users. This attribution is technical and does not represent employee activity.

The seed preserves existing sales and checks the 10000-row synchronization limit. The dates remain fixed across reruns. The storefront displays only the most recent 100 sales per store, while warehouse reports use the complete synchronized dataset. Refresh Metabase after synchronization and use a date range covering the seed period.

[Back to documentation](README.md)
