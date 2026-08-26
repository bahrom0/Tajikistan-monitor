-- Update only the source link selected by external_id/canonical_url.
-- Multiple low-content NBT cards can share one canonical article after
-- deduplication; updating every link for that article would collide with the
-- unique (source_id, external_id) constraint.
create or replace function public.ingest_article_source(
  p_source_id text,
  p_external_id text,
  p_url text,
  p_canonical_url text,
  p_title text,
  p_description text,
  p_normalized_title text,
  p_normalized_text text,
  p_title_tokens text[],
  p_text_tokens text[],
  p_location_ids text[],
  p_language text,
  p_category text,
  p_severity text,
  p_content_hash text,
  p_dedupe_hash text,
  p_published_at timestamptz
)
returns table (
  result_article_id uuid,
  match_type text,
  match_score numeric,
  source_created boolean
)
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_article_id uuid;
  v_source_row_id uuid;
  v_match_type text;
  v_match_score numeric;
  v_has_places boolean;
begin
  if nullif(trim(p_external_id), '') is null
    or nullif(trim(p_title), '') is null
    or nullif(trim(p_normalized_title), '') is null then
    raise exception 'Article identity fields cannot be empty';
  end if;
  if p_content_hash !~ '^[a-f0-9]{64}$' or p_dedupe_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Article hashes must be lowercase SHA-256';
  end if;

  p_title_tokens := coalesce(p_title_tokens, '{}'::text[]);
  p_text_tokens := coalesce(p_text_tokens, '{}'::text[]);
  p_location_ids := coalesce(p_location_ids, '{}'::text[]);

  -- Low-volume official ingestion favors correctness: one transaction decides
  -- both the canonical article and its source links, preventing concurrent duplicates.
  perform pg_advisory_xact_lock(8142092026081509);

  select source_row.id, source_row.article_id
  into v_source_row_id, v_article_id
  from public.article_sources source_row
  where source_row.source_id = p_source_id
    and (
      source_row.external_id = p_external_id
      or (p_canonical_url <> '' and source_row.canonical_url = p_canonical_url)
    )
  order by (source_row.external_id = p_external_id) desc, source_row.first_seen_at
  limit 1;

  if v_article_id is not null then
    update public.article_sources
    set external_id = p_external_id,
        url = p_url,
        canonical_url = p_canonical_url,
        title = p_title,
        description = p_description,
        language = p_language,
        content_hash = p_content_hash,
        dedupe_hash = p_dedupe_hash,
        location_ids = p_location_ids,
        published_at = p_published_at,
        last_seen_at = now()
    where id = v_source_row_id;

    update public.articles article
    set title = case when article.source_id = p_source_id then p_title else article.title end,
        description = case when article.source_id = p_source_id then p_description else article.description end,
        url = case when article.source_id = p_source_id then p_url else article.url end,
        canonical_url = case when article.source_id = p_source_id then p_canonical_url else article.canonical_url end,
        normalized_title = case when article.source_id = p_source_id then p_normalized_title else article.normalized_title end,
        normalized_text = case when article.source_id = p_source_id then p_normalized_text else article.normalized_text end,
        title_tokens = case when article.source_id = p_source_id then p_title_tokens else article.title_tokens end,
        text_tokens = case when article.source_id = p_source_id then p_text_tokens else article.text_tokens end,
        location_ids = case when article.source_id = p_source_id then p_location_ids else article.location_ids end,
        content_hash = case when article.source_id = p_source_id then p_content_hash else article.content_hash end,
        dedupe_hash = case when article.source_id = p_source_id then p_dedupe_hash else article.dedupe_hash end,
        published_at = case when article.source_id = p_source_id then p_published_at else article.published_at end,
        severity = case when article.severity = 'alert' or p_severity = 'alert' then 'alert' else 'normal' end,
        source_count = (
          select count(distinct linked.source_id)::integer
          from public.article_sources linked
          where linked.article_id = v_article_id
        ),
        updated_at = now()
    where article.id = v_article_id;

    return query select v_article_id, 'source_identity'::text, 1::numeric, false;
    return;
  end if;

  select source_row.article_id,
    case
      when p_canonical_url <> '' and source_row.canonical_url = p_canonical_url then 'canonical_url'
      when source_row.content_hash = p_content_hash then 'content_hash'
      else 'dedupe_hash'
    end
  into v_article_id, v_match_type
  from public.article_sources source_row
  where (p_canonical_url <> '' and source_row.canonical_url = p_canonical_url)
    or source_row.content_hash = p_content_hash
    or source_row.dedupe_hash = p_dedupe_hash
  order by
    (p_canonical_url <> '' and source_row.canonical_url = p_canonical_url) desc,
    (source_row.content_hash = p_content_hash) desc,
    source_row.first_seen_at
  limit 1;

  if v_article_id is null then
    select candidate.id, candidate.score, candidate.has_places
    into v_article_id, v_match_score, v_has_places
    from (
      select article.id,
        cardinality(article.location_ids) > 0 as has_places,
        similarity.title_score,
        similarity.text_score,
        case when cardinality(article.location_ids) > 0 then
          similarity.title_score * 0.52
          + similarity.text_score * 0.33
          + similarity.time_score * 0.10
          + 0.05
        else
          similarity.title_score * 0.58
          + similarity.text_score * 0.37
          + similarity.time_score * 0.05
        end as score
      from public.articles article
      cross join lateral (
        select
          private.token_jaccard(article.title_tokens, p_title_tokens) as title_score,
          private.token_jaccard(article.text_tokens, p_text_tokens) as text_score,
          greatest(0::numeric, 1::numeric - (
            abs(extract(epoch from article.published_at - p_published_at))::numeric / 43200
          )) as time_score
      ) similarity
      where article.category = p_category
        and article.published_at between p_published_at - interval '12 hours'
          and p_published_at + interval '12 hours'
        and (
          (cardinality(article.location_ids) = 0 and cardinality(p_location_ids) = 0)
          or (
            cardinality(article.location_ids) > 0
            and cardinality(p_location_ids) > 0
            and article.location_ids && p_location_ids
          )
        )
    ) candidate
    where (
      candidate.has_places
      and candidate.title_score >= 0.90
      and candidate.text_score >= 0.82
      and candidate.score >= 0.91
    ) or (
      not candidate.has_places
      and candidate.title_score >= 0.96
      and candidate.text_score >= 0.90
      and candidate.score >= 0.94
    )
    order by candidate.score desc
    limit 1;

    if v_article_id is not null then
      v_match_type := case when v_has_places then 'similarity_with_place' else 'similarity_without_place' end;
    end if;
  else
    v_match_score := 1;
  end if;

  if v_article_id is null then
    insert into public.articles (
      source_id, external_id, url, canonical_url, title, description,
      normalized_title, normalized_text, title_tokens, text_tokens, location_ids,
      language, category, severity, content_hash, dedupe_hash, published_at,
      is_published, source_count, updated_at
    ) values (
      p_source_id, p_external_id, p_url, p_canonical_url, p_title, p_description,
      p_normalized_title, p_normalized_text, p_title_tokens, p_text_tokens, p_location_ids,
      p_language, p_category, p_severity, p_content_hash, p_dedupe_hash, p_published_at,
      true, 1, now()
    ) returning id into v_article_id;
    v_match_type := 'new';
    v_match_score := 0;
  end if;

  insert into public.article_sources (
    article_id, source_id, external_id, url, canonical_url, title, description,
    language, content_hash, dedupe_hash, location_ids, published_at, last_seen_at
  ) values (
    v_article_id, p_source_id, p_external_id, p_url, p_canonical_url, p_title, p_description,
    p_language, p_content_hash, p_dedupe_hash, p_location_ids, p_published_at, now()
  )
  on conflict (source_id, external_id) do update
  set article_id = excluded.article_id,
      url = excluded.url,
      canonical_url = excluded.canonical_url,
      title = excluded.title,
      description = excluded.description,
      language = excluded.language,
      content_hash = excluded.content_hash,
      dedupe_hash = excluded.dedupe_hash,
      location_ids = excluded.location_ids,
      published_at = excluded.published_at,
      last_seen_at = now();

  update public.articles article
  set severity = case when article.severity = 'alert' or p_severity = 'alert' then 'alert' else 'normal' end,
      source_count = (
        select count(distinct linked.source_id)::integer
        from public.article_sources linked
        where linked.article_id = v_article_id
      ),
      updated_at = now()
  where article.id = v_article_id;

  return query select v_article_id, v_match_type, v_match_score, true;
end;
$function$;

revoke all on function public.ingest_article_source(
  text, text, text, text, text, text, text, text, text[], text[], text[],
  text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.ingest_article_source(
  text, text, text, text, text, text, text, text, text[], text[], text[],
  text, text, text, text, text, timestamptz
) to service_role;
