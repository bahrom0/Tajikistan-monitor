# Supabase ingestion setup

Task 7 adds a one-minute Cron tick and the `ingest-dispatcher` Edge Function. The dispatcher creates at most one queued job for a source and scheduled timestamp, then advances `sources.next_fetch_at` by that source's configured interval.

## Cloud setup

1. Create or select the Supabase project and link this checkout with the Supabase CLI.
2. In **Settings → API Keys**, create a named secret key called `ingest-dispatcher`.
3. In Vault, create these secrets:
   - `project_url`: the project API URL, for example `https://<project-ref>.supabase.co`;
   - `ingest_dispatcher_secret_key`: the value of the named secret key.
4. Push migrations and deploy `ingest-dispatcher` and `ingest-worker`.

Do not put the secret key in `.env`, Vite variables, SQL migration text, frontend code, or git. The Cron query sends the new secret key only through the `apikey` header, as required by the current Supabase key model.

## Verification

After deployment, verify:

```sql
select jobname, schedule, active from cron.job where jobname in ('tajikistan-monitor-ingest-dispatcher', 'tajikistan-monitor-ingest-worker');
select id, next_fetch_at from public.sources order by id;
select source_id, scheduled_for, status from public.ingestion_jobs order by created_at desc limit 20;
select source_id, status, article_count, weather_count, rate_count from public.source_fetch_runs order by started_at desc limit 20;
select count(*) from public.articles;
```

If the two Vault secrets are absent, Cron intentionally sends no request. The dispatcher creates idempotent jobs; the worker claims them with `FOR UPDATE SKIP LOCKED`, stores articles/weather/rates, retries transient errors, and moves exhausted jobs to `dead_letter`.
