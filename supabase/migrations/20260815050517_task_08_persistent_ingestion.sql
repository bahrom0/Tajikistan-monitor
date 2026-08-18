alter table public.sources
  add column language text not null default 'ru' check (language in ('ru', 'tg', 'multi')),
  add column trust_weight numeric(4, 3) not null default 1 check (trust_weight between 0 and 1);

update public.sources set language = 'tg' where id = 'khovar-tj';

alter table public.ingestion_jobs
  add column retry_at timestamptz,
  add column locked_by uuid;

drop index if exists public.ingestion_jobs_ready_idx;
create index ingestion_jobs_ready_idx
  on public.ingestion_jobs (coalesce(retry_at, scheduled_for), created_at)
  where status in ('queued', 'failed');

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id) on delete restrict,
  external_id text not null,
  url text not null check (url = '' or url ~ '^https://'),
  canonical_url text not null,
  title text not null check (length(title) between 1 and 1000),
  description text not null default '' check (length(description) <= 5000),
  language text not null default 'ru' check (language in ('ru', 'tg', 'multi')),
  category text not null default 'Другое',
  severity text not null default 'normal' check (severity in ('normal', 'alert')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  published_at timestamptz not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index articles_published_idx on public.articles (published_at desc) where is_published;
create index articles_source_published_idx on public.articles (source_id, published_at desc) where is_published;

create table public.weather_alerts (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id) on delete restrict,
  external_id text not null,
  text text not null check (length(text) between 1 and 5000),
  severity text not null default 'alert' check (severity in ('normal', 'alert')),
  published_at timestamptz not null,
  source_url text not null check (source_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table public.weather_forecasts (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id) on delete restrict,
  city text not null,
  temperature text not null,
  observed_at timestamptz not null,
  source_url text not null check (source_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, city)
);

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id) on delete restrict,
  numeric_code text not null,
  code text not null,
  unit integer not null check (unit > 0),
  name_ru text not null,
  rate_tjs numeric(18, 6) not null check (rate_tjs > 0),
  effective_at timestamptz not null,
  source_url text not null check (source_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, code, effective_at)
);

create index exchange_rates_effective_idx on public.exchange_rates (effective_at desc, code);

create table public.source_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.ingestion_jobs(id) on delete cascade,
  source_id text not null references public.sources(id) on delete restrict,
  status text not null check (status in ('running', 'succeeded', 'failed', 'dead_letter')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  article_count integer not null default 0 check (article_count >= 0),
  weather_count integer not null default 0 check (weather_count >= 0),
  rate_count integer not null default 0 check (rate_count >= 0),
  error_code text check (error_code is null or length(error_code) <= 100),
  error_message text check (error_message is null or length(error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index source_fetch_runs_source_idx on public.source_fetch_runs (source_id, started_at desc);

alter table public.articles enable row level security;
alter table public.weather_alerts enable row level security;
alter table public.weather_forecasts enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.source_fetch_runs enable row level security;

revoke all on table public.articles, public.weather_alerts, public.weather_forecasts, public.exchange_rates, public.source_fetch_runs from anon, authenticated;

grant select (id, source_id, external_id, url, canonical_url, title, description, language, category, severity, published_at, updated_at)
  on table public.articles to anon, authenticated;
grant select (id, source_id, external_id, text, severity, published_at, source_url, updated_at)
  on table public.weather_alerts to anon, authenticated;
grant select (id, source_id, city, temperature, observed_at, source_url, updated_at)
  on table public.weather_forecasts to anon, authenticated;
grant select (id, source_id, numeric_code, code, unit, name_ru, rate_tjs, effective_at, source_url, updated_at)
  on table public.exchange_rates to anon, authenticated;

create policy "Public can read published articles"
  on public.articles for select to anon, authenticated using (is_published = true);
create policy "Public can read weather alerts"
  on public.weather_alerts for select to anon, authenticated using (true);
create policy "Public can read weather forecasts"
  on public.weather_forecasts for select to anon, authenticated using (true);
create policy "Public can read exchange rates"
  on public.exchange_rates for select to anon, authenticated using (true);
create policy "Public cannot access source fetch runs"
  on public.source_fetch_runs for all to anon, authenticated using (false) with check (false);

create or replace function public.claim_ingestion_jobs(p_limit integer, p_worker_id uuid)
returns table (
  job_id uuid,
  source_id text,
  attempt_count integer,
  source_name text,
  source_kind text,
  source_adapter text,
  source_url text,
  source_language text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  update public.ingestion_jobs
  set status = 'failed',
      retry_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = 'Recovered stale worker lock',
      updated_at = now()
  where status = 'running' and locked_at < now() - interval '3 minutes';

  return query
  with candidates as (
    select j.id
    from public.ingestion_jobs j
    where j.status in ('queued', 'failed')
      and coalesce(j.retry_at, j.scheduled_for) <= now()
    order by coalesce(j.retry_at, j.scheduled_for), j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 2), 4))
  ), claimed as (
    update public.ingestion_jobs j
    set status = 'running',
        attempt_count = j.attempt_count + 1,
        locked_at = now(),
        locked_by = p_worker_id,
        started_at = coalesce(j.started_at, now()),
        finished_at = null,
        last_error = null,
        updated_at = now()
    from candidates c
    where j.id = c.id
    returning j.id, j.source_id, j.attempt_count
  )
  select c.id, c.source_id, c.attempt_count, s.name, s.kind, s.adapter, s.url, s.language
  from claimed c
  join public.sources s on s.id = c.source_id;
end;
$function$;

revoke all on function public.claim_ingestion_jobs(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_ingestion_jobs(integer, uuid) to service_role;

select cron.schedule(
  'tajikistan-monitor-ingest-worker',
  '* * * * *',
  $cron$
    with worker_secrets as (
      select
        max(decrypted_secret) filter (where name = 'project_url') as project_url,
        max(decrypted_secret) filter (where name = 'ingest_dispatcher_secret_key') as secret_key
      from vault.decrypted_secrets
      where name in ('project_url', 'ingest_dispatcher_secret_key')
    )
    select net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/ingest-worker',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret_key),
      body := jsonb_build_object('trigger', 'cron', 'requested_at', now()),
      timeout_milliseconds := 120000
    )
    from worker_secrets
    where project_url is not null and secret_key is not null;
  $cron$
);
