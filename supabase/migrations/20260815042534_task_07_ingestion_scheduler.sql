create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.sources (
  id text primary key,
  name text not null,
  kind text not null,
  adapter text not null,
  url text not null check (url ~ '^https://'),
  interval_seconds integer not null check (interval_seconds between 60 and 86400),
  enabled boolean not null default true,
  next_fetch_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id) on delete restrict,
  scheduled_for timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, scheduled_for)
);

create index ingestion_jobs_ready_idx
  on public.ingestion_jobs (status, scheduled_for)
  where status in ('queued', 'failed');

alter table public.sources enable row level security;
alter table public.ingestion_jobs enable row level security;

revoke all on table public.sources from anon, authenticated;
revoke all on table public.ingestion_jobs from anon, authenticated;

grant select (id, name, kind, adapter, url, interval_seconds, enabled, next_fetch_at, last_success_at, last_error_at)
  on table public.sources to anon, authenticated;

create policy "Public can read enabled source metadata"
  on public.sources
  for select
  to anon, authenticated
  using (enabled = true);

insert into public.sources (id, name, kind, adapter, url, interval_seconds)
values
  ('khovar-ru', 'НИАТ «Ховар»', 'Новости', 'rss', 'https://khovar.tj/rus/feed/', 300),
  ('khovar-tj', 'АМИТ «Ховар»', 'Ахбор', 'rss', 'https://khovar.tj/feed/', 300),
  ('statistics', 'Агентство статистики', 'Статистика', 'rss', 'https://www.stat.tj/ru/category/news_ru/feed/', 1800),
  ('kchs', 'КЧС Таджикистана', 'ЧС', 'kchs', 'https://www.kchs.tj/', 300),
  ('meteo', 'Агентство по гидрометеорологии', 'Погода', 'meteo', 'https://meteo.tj/ru', 900),
  ('nbt-news', 'Национальный банк — новости', 'Финансы', 'nbt-news', 'https://nbt.tj/ru/news/', 1800),
  ('nbt-rates', 'Национальный банк — курсы', 'Курсы валют', 'nbt-rates', 'https://nbt.tj/ru/kurs/kurs.php', 1800)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  adapter = excluded.adapter,
  url = excluded.url,
  interval_seconds = excluded.interval_seconds,
  updated_at = now();

-- The query is safe before Vault is configured: without both named secrets it sends nothing.
select cron.schedule(
  'tajikistan-monitor-ingest-dispatcher',
  '* * * * *',
  $cron$
    with scheduler_secrets as (
      select
        max(decrypted_secret) filter (where name = 'project_url') as project_url,
        max(decrypted_secret) filter (where name = 'ingest_dispatcher_secret_key') as secret_key
      from vault.decrypted_secrets
      where name in ('project_url', 'ingest_dispatcher_secret_key')
    )
    select net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/ingest-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', secret_key
      ),
      body := jsonb_build_object('trigger', 'cron', 'requested_at', now()),
      timeout_milliseconds := 20000
    )
    from scheduler_secrets
    where project_url is not null and secret_key is not null;
  $cron$
);
