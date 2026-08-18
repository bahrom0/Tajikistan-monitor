import locationsDataset from '../../src/data/geography/locations.json' with { type: 'json' };

const projectUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const endpoint = (table, query) => `${projectUrl.replace(/\/$/, '')}/rest/v1/${table}?${query}`;

async function select(table, query) {
  const response = await fetch(endpoint(table, query), {
    signal: AbortSignal.timeout(10_000),
    headers: { apikey: publishableKey, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Supabase cache ${table}: HTTP ${response.status}`);
  return response.json();
}

export async function loadSupabaseMonitorCache() {
  if (!projectUrl || !publishableKey) return null;
  const [sourceRows, articleRows, locationRows, alertRows, forecastRows, rateRows] = await Promise.all([
    select('sources', 'select=id,name,interval_seconds,last_success_at,last_error_at&enabled=eq.true&order=id'),
    select('articles', 'select=id,source_id,title,description,url,category,category_confidence,importance,importance_confidence,enrichment_status,published_at,severity&order=published_at.desc&limit=200'),
    select('article_locations', 'select=article_id,location_id,confidence,evidence,evidence_field,matched_alias,method&limit=1000'),
    select('weather_alerts', 'select=id,source_id,text,severity,published_at,source_url&order=published_at.desc&limit=30'),
    select('weather_forecasts', 'select=id,source_id,city,temperature,observed_at,source_url&order=city'),
    select('exchange_rates', 'select=id,source_id,numeric_code,code,unit,name_ru,rate_tjs,effective_at,source_url&order=effective_at.desc&limit=100'),
  ]);
  const sourcesById = new Map(sourceRows.map((source) => [source.id, source]));
  const canonicalLocations = new Map(locationsDataset.locations.map((location) => [location.id, location]));
  const hierarchy = (location) => {
    let current = location;
    let regionId = location.type === 'region' ? location.id : null;
    let districtId = location.type === 'district' ? location.id : null;
    const visited = new Set();
    while (current?.parent_id && !visited.has(current.parent_id)) {
      visited.add(current.parent_id);
      current = canonicalLocations.get(current.parent_id);
      if (current?.type === 'region') regionId = current.id;
      if (current?.type === 'district') districtId = current.id;
    }
    return { regionId, districtId };
  };
  const locationsByArticle = new Map();
  for (const row of locationRows) {
    const location = canonicalLocations.get(row.location_id);
    if (!location) continue;
    const values = locationsByArticle.get(row.article_id) || [];
    values.push({
      locationId: location.id, nameRu: location.name_ru, nameTg: location.name_tg,
      locationType: location.type, longitude: location.longitude, latitude: location.latitude,
      ...hierarchy(location), confidence: Number(row.confidence), evidence: row.evidence,
      evidenceField: row.evidence_field, matchedAlias: row.matched_alias,
      method: row.method === 'ai_structured' ? 'ai_disambiguation' : 'deterministic_alias',
    });
    locationsByArticle.set(row.article_id, values);
  }
  const counts = new Map();
  for (const row of [...articleRows, ...forecastRows, ...rateRows]) counts.set(row.source_id, (counts.get(row.source_id) || 0) + 1);

  const items = articleRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    sourceId: row.source_id,
    sourceName: sourcesById.get(row.source_id)?.name || row.source_id,
    category: row.category,
    categoryConfidence: Number(row.category_confidence || 0),
    importance: row.importance || 'info',
    importanceConfidence: Number(row.importance_confidence || 0),
    enrichmentStatus: row.enrichment_status || 'pending',
    publishedAt: row.published_at,
    severity: row.severity,
    locations: locationsByArticle.get(row.id) || [],
  }));
  const statuses = sourceRows.map((source) => {
    const success = source.last_success_at ? Date.parse(source.last_success_at) : 0;
    const failure = source.last_error_at ? Date.parse(source.last_error_at) : 0;
    const stale = success > 0 && Date.now() - success > Number(source.interval_seconds || 300) * 3_000;
    const status = !success ? 'offline' : failure > success || stale ? 'degraded' : 'online';
    return { id: source.id, name: source.name, status, count: counts.get(source.id) || 0, checkedAt: source.last_success_at || source.last_error_at || '' };
  });
  const weather = {
    alerts: alertRows.map((row) => ({ id: row.id, text: row.text, severity: row.severity, publishedAt: row.published_at, sourceUrl: row.source_url })),
    forecasts: forecastRows.map((row) => ({ city: row.city, temperature: row.temperature, observedAt: row.observed_at, sourceUrl: row.source_url })),
  };
  const rates = rateRows.map((row) => ({ numericCode: row.numeric_code, code: row.code, unit: row.unit, nameRu: row.name_ru, rateTjs: Number(row.rate_tjs), effectiveAt: row.effective_at, sourceUrl: row.source_url }));
  return { items, statuses, weather, rates };
}
