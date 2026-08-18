create policy "Public cannot access ingestion jobs"
  on public.ingestion_jobs
  for all
  to anon, authenticated
  using (false)
  with check (false);
