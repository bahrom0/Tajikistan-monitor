alter table public.articles
  add column enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending', 'rules_only', 'completed', 'review_required', 'failed')),
  add column category_confidence numeric(4,3) not null default 0
    check (category_confidence between 0 and 1),
  add column category_method text not null default 'source_default'
    check (category_method in ('source_default', 'rules', 'ai')),
  add column importance text not null default 'info'
    check (importance in ('info', 'important', 'warning', 'critical')),
  add column importance_confidence numeric(4,3) not null default 0
    check (importance_confidence between 0 and 1),
  add column importance_factors text[] not null default '{}',
  add column enrichment_updated_at timestamptz;

create table public.article_enrichments (
  article_id uuid primary key references public.articles(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('rules_only', 'completed', 'review_required', 'failed')),
  provider text not null check (length(provider) between 1 and 100),
  model text not null check (length(model) between 1 and 200),
  prompt_version text not null check (length(prompt_version) between 1 and 100),
  context_summary text not null default '' check (length(context_summary) <= 4000),
  key_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(key_facts) = 'array'),
  uncertainties jsonb not null default '[]'::jsonb check (jsonb_typeof(uncertainties) = 'array'),
  error_code text check (error_code is null or length(error_code) <= 100),
  error_message text check (error_message is null or length(error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index article_enrichments_status_idx
  on public.article_enrichments (status, updated_at desc);

create table public.article_locations (
  article_id uuid not null references public.articles(id) on delete cascade,
  location_id text not null check (location_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  evidence text not null check (length(evidence) between 1 and 1000),
  evidence_field text not null check (evidence_field in ('title', 'description', 'combined')),
  matched_alias text not null default '' check (length(matched_alias) <= 500),
  method text not null check (method in ('deterministic_alias', 'ai_structured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, location_id)
);

create index article_locations_location_idx
  on public.article_locations (location_id, article_id);

alter table public.article_enrichments enable row level security;
alter table public.article_locations enable row level security;

revoke all on table public.article_enrichments, public.article_locations from anon, authenticated;
grant select (
  article_id, status, context_summary, key_facts, uncertainties, updated_at
) on table public.article_enrichments to anon, authenticated;
grant select (
  article_id, location_id, confidence, evidence, evidence_field, matched_alias, method
) on table public.article_locations to anon, authenticated;
grant select, insert, update, delete on table public.article_enrichments, public.article_locations to service_role;

create policy "Public can read enrichment of published articles"
  on public.article_enrichments for select to anon, authenticated
  using (exists (
    select 1 from public.articles article
    where article.id = article_enrichments.article_id and article.is_published = true
  ));

create policy "Public can read locations of published articles"
  on public.article_locations for select to anon, authenticated
  using (exists (
    select 1 from public.articles article
    where article.id = article_locations.article_id and article.is_published = true
  ));

create or replace function public.store_article_enrichment(
  p_article_id uuid,
  p_content_hash text,
  p_status text,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_category text,
  p_category_confidence numeric,
  p_category_method text,
  p_importance text,
  p_importance_confidence numeric,
  p_importance_factors text[],
  p_context_summary text,
  p_key_facts jsonb,
  p_uncertainties jsonb,
  p_locations jsonb,
  p_error_code text default null,
  p_error_message text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_status not in ('rules_only', 'completed', 'review_required', 'failed')
    or p_category_method not in ('source_default', 'rules', 'ai')
    or p_importance not in ('info', 'important', 'warning', 'critical')
    or p_category_confidence not between 0 and 1
    or p_importance_confidence not between 0 and 1
    or jsonb_typeof(p_locations) <> 'array'
    or jsonb_typeof(p_key_facts) <> 'array'
    or jsonb_typeof(p_uncertainties) <> 'array'
  then
    raise exception 'Invalid article enrichment payload';
  end if;

  insert into public.article_enrichments (
    article_id, content_hash, status, provider, model, prompt_version,
    context_summary, key_facts, uncertainties, error_code, error_message, updated_at
  ) values (
    p_article_id, p_content_hash, p_status, p_provider, p_model, p_prompt_version,
    left(coalesce(p_context_summary, ''), 4000), p_key_facts, p_uncertainties,
    left(p_error_code, 100), left(p_error_message, 500), now()
  )
  on conflict (article_id) do update
  set content_hash = excluded.content_hash,
      status = excluded.status,
      provider = excluded.provider,
      model = excluded.model,
      prompt_version = excluded.prompt_version,
      context_summary = excluded.context_summary,
      key_facts = excluded.key_facts,
      uncertainties = excluded.uncertainties,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      updated_at = now();

  delete from public.article_locations where article_id = p_article_id;
  insert into public.article_locations (
    article_id, location_id, confidence, evidence, evidence_field, matched_alias, method, updated_at
  )
  select
    p_article_id,
    location.location_id,
    location.confidence,
    left(location.evidence, 1000),
    location.evidence_field,
    left(coalesce(location.matched_alias, ''), 500),
    location.method,
    now()
  from jsonb_to_recordset(p_locations) as location(
    location_id text,
    confidence numeric,
    evidence text,
    evidence_field text,
    matched_alias text,
    method text
  )
  where location.location_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and location.confidence between 0 and 1
    and nullif(trim(location.evidence), '') is not null
    and location.evidence_field in ('title', 'description', 'combined')
    and location.method in ('deterministic_alias', 'ai_structured')
  on conflict (article_id, location_id) do update
  set confidence = excluded.confidence,
      evidence = excluded.evidence,
      evidence_field = excluded.evidence_field,
      matched_alias = excluded.matched_alias,
      method = excluded.method,
      updated_at = now();

  update public.articles article
  set location_ids = coalesce((
        select array_agg(location.location_id order by location.location_id)
        from public.article_locations location
        where location.article_id = p_article_id
      ), '{}'::text[]),
      category = left(p_category, 100),
      category_confidence = p_category_confidence,
      category_method = p_category_method,
      importance = p_importance,
      importance_confidence = p_importance_confidence,
      importance_factors = coalesce(p_importance_factors, '{}'),
      severity = case when p_importance in ('warning', 'critical') then 'alert' else 'normal' end,
      enrichment_status = p_status,
      enrichment_updated_at = now(),
      updated_at = now()
  where article.id = p_article_id;

  if not found then raise exception 'Article not found'; end if;
end;
$function$;

revoke all on function public.store_article_enrichment(
  uuid, text, text, text, text, text, text, numeric, text, text, numeric,
  text[], text, jsonb, jsonb, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.store_article_enrichment(
  uuid, text, text, text, text, text, text, numeric, text, text, numeric,
  text[], text, jsonb, jsonb, jsonb, text, text
) to service_role;
