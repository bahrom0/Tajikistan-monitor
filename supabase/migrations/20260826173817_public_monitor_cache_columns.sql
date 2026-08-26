-- Keep the public monitor cache readable without exposing ingestion internals.
-- The cache query and article_locations RLS policy use these columns in
-- addition to the base article columns granted by task_08.
grant select (
  is_published,
  category_confidence,
  importance,
  importance_confidence,
  enrichment_status
)
  on table public.articles to anon, authenticated;
