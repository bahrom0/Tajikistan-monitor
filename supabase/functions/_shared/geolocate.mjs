export const GEOLOCATION_THRESHOLD = 0.78;

const normalize = (value) => String(value || '')
  .normalize('NFKC').toLocaleLowerCase('ru-RU')
  .replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const administrativeBase = (value) => normalize(value)
  .replace(/^(вилояти мухтори|вилояти|ноҳияҳои|ноҳияи|районы|район|горно-бадахшанская автономная|согдийская|хатлонская)\s+/u, '')
  .replace(/\s+(автономная область|область|район)$/u, '').trim();

function evidenceFragment(text, index, length) {
  const start = Math.max(0, index - 55);
  const end = Math.min(text.length, index + length + 55);
  return `${start ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export function createGeolocator(locations, aliasDataset = { aliases: {} }) {
  const byAlias = new Map();
  const byId = new Map(locations.map((location) => [location.id, location]));
  const register = (locationId, value, kind) => {
    const alias = normalize(value);
    if (alias.length < 4) return;
    const entries = byAlias.get(alias) || [];
    if (!entries.some((entry) => entry.locationId === locationId)) entries.push({ locationId, kind });
    byAlias.set(alias, entries);
  };
  for (const location of locations) {
    register(location.id, location.name_ru, 'canonical');
    register(location.id, location.name_tg, 'canonical');
    register(location.id, administrativeBase(location.name_ru), 'base');
    register(location.id, administrativeBase(location.name_tg), 'base');
  }
  for (const [locationId, aliases] of Object.entries(aliasDataset.aliases || {})) {
    if (!byId.has(locationId)) throw new Error(`Alias references unknown location: ${locationId}`);
    for (const alias of aliases) register(locationId, alias, 'historical');
  }
  const searchable = [...byAlias.entries()]
    .sort((left, right) => right[0].length - left[0].length)
    .map(([alias, entries]) => ({
      alias,
      entries,
      pattern: new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(alias)})(?=$|[^\\p{L}\\p{N}])`, 'iu'),
    }));
  const hierarchy = (location) => {
    let current = location;
    let regionId = location.type === 'region' ? location.id : null;
    let districtId = location.type === 'district' ? location.id : null;
    const visited = new Set();
    while (current?.parent_id && !visited.has(current.parent_id)) {
      visited.add(current.parent_id);
      current = byId.get(current.parent_id);
      if (current?.type === 'region') regionId = current.id;
      if (current?.type === 'district') districtId = current.id;
    }
    return { regionId, districtId };
  };
  return (article) => {
    const bestByLocation = new Map();
    for (const [field, rawText] of [['title', article.title], ['description', article.description]]) {
      const text = String(rawText || '');
      const normalizedText = normalize(text);
      for (const { entries, pattern } of searchable) {
        const match = pattern.exec(normalizedText);
        if (!match) continue;
        const pointEntries = entries.filter(({ locationId }) => {
          const location = byId.get(locationId);
          return Number.isFinite(location.longitude) && Number.isFinite(location.latitude);
        });
        const candidates = pointEntries.length === 1 ? pointEntries : entries;
        const ambiguous = candidates.length > 1;
        for (const entry of candidates) {
          const location = byId.get(entry.locationId);
          const confidence = ambiguous ? 0.55 : field === 'title'
            ? (entry.kind === 'canonical' ? 0.97 : entry.kind === 'historical' ? 0.93 : 0.9)
            : (entry.kind === 'canonical' ? 0.88 : entry.kind === 'historical' ? 0.84 : 0.81);
          const result = {
            locationId: location.id, confidence,
            evidence: evidenceFragment(text, match.index + match[1].length, match[2].length),
            evidenceField: field, matchedAlias: match[2], method: 'deterministic_alias',
            ...hierarchy(location),
          };
          if (!bestByLocation.has(location.id) || bestByLocation.get(location.id).confidence < confidence) bestByLocation.set(location.id, result);
        }
      }
    }
    const matches = [...bestByLocation.values()];
    return {
      locations: matches.filter(({ confidence }) => confidence >= GEOLOCATION_THRESHOLD).sort((a, b) => b.confidence - a.confidence),
      geolocationCandidates: matches.filter(({ confidence }) => confidence >= 0.45 && confidence < GEOLOCATION_THRESHOLD).sort((a, b) => b.confidence - a.confidence),
    };
  };
}
