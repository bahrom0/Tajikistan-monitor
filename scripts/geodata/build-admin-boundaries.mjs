import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OSM_API_URL = 'https://api.openstreetmap.org/api/0.6';
const OSM_SOURCE = 'https://www.openstreetmap.org/copyright';
const LOCATION_PATH = resolve('src/data/geography/locations.json');
const OUTPUT_PATH = resolve('src/data/geography/administrative-boundaries.json');
const REPORT_PATH = resolve('data/geography/admin-boundary-reconciliation.md');

const relationByLocationId = {
  'region-gbao': 3279614, 'region-sughd': 3279374, 'region-khatlon': 3279616,
  'region-dushanbe': 7328360, 'region-rrp': 3279615,
  'district-vanj': 3281956, 'district-darvoz': 3281969, 'district-ishkoshim': 3281971,
  'district-murghob': 3281933, 'district-roshtqala': 3281930, 'district-rushon': 3281942,
  'district-shughnon': 3281967, 'district-ayni': 3280692, 'district-asht': 3280682,
  'district-devashtich': 3280690, 'district-zafarobod': 3280689, 'district-mastchoh': 3280691,
  'district-kohistoni-mastchoh': 3280686, 'district-spitamen': 3280688,
  'district-jabbor-rasulov': 3281014, 'district-bobojon-ghafurov': 3280693,
  'district-shahriston': 3280685, 'district-baljuvon': 3281963, 'district-kushoniyon': 3281954,
  'district-vakhsh': 3281943, 'district-vose': 3281955, 'district-danghara': 3281965,
  'district-yovon': 3281960, 'district-jaloliddin-balkhi': 3281953, 'district-muminobod': 3281938,
  'district-hamadoni': 3281951, 'district-nosiri-khusrav': 3281932, 'district-panj': 3281958,
  'district-temurmalik': 3281950, 'district-khovaling': 3281962, 'district-farkhor': 3281966,
  'district-khuroson': 3281945, 'district-dusti': 3281964, 'district-qubodiyon': 3281961,
  'district-abdurahmon-jomi': 3281941, 'district-jayhun': 3281946, 'district-shahritus': 3281934,
  'district-shamsiddin-shohin': 6870523, 'district-varzob': 3281939, 'district-lakhsh': 3281957,
  'district-nurobod': 3281949, 'district-rasht': 3281968, 'district-sangvor': 3281972,
  'district-tojikobod': 3281931, 'district-fayzobod': 3281936, 'district-rudaki': 3281973,
  'district-shahrinav': 3281948,
};

const same = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
const coordinate = (point) => [point.lon, point.lat];

function stitchRings(segments) {
  const pending = segments.filter((segment) => segment.length > 1).map((segment) => [...segment]);
  const rings = [];
  while (pending.length) {
    const ring = pending.shift();
    while (!same(ring[0], ring.at(-1))) {
      const index = pending.findIndex((segment) => same(segment[0], ring.at(-1)) || same(segment.at(-1), ring.at(-1)));
      if (index < 0) break;
      const [next] = pending.splice(index, 1);
      if (same(next.at(-1), ring.at(-1))) next.reverse();
      ring.push(...next.slice(1));
    }
    if (same(ring[0], ring.at(-1)) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function distance(point, start, end) {
  const dx = end[0] - start[0]; const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let max = 0; let pivot = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = distance(points[index], points[0], points.at(-1));
    if (current > max) { max = current; pivot = index; }
  }
  if (max <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, pivot + 1), tolerance).slice(0, -1), ...simplify(points.slice(pivot), tolerance)];
}

function simplifyRing(ring, tolerance) {
  const result = simplify(ring, tolerance);
  return result.length >= 4 ? result : ring;
}

function relationGeometry(relation, wayById, nodeById) {
  const outerSegments = relation.members
    .filter((member) => member.type === 'way' && member.role !== 'inner' && wayById.has(member.ref))
    .map((member) => wayById.get(member.ref).nodes.map((nodeId) => coordinate(nodeById.get(nodeId))));
  const rings = stitchRings(outerSegments).map((ring) => simplifyRing(ring, 0.0025));
  if (!rings.length) throw new Error(`relation/${relation.id} has no closed outer geometry`);
  return rings.length === 1
    ? { type: 'Polygon', coordinates: rings }
    : { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) };
}

const dataset = JSON.parse(await readFile(LOCATION_PATH, 'utf8'));
const adminLocations = dataset.locations.filter(({ type }) => type === 'region' || type === 'district');
const expectedIds = new Set(adminLocations.map(({ id }) => id));
const mappingIds = new Set(Object.keys(relationByLocationId));
const missingMappings = [...expectedIds].filter((id) => !mappingIds.has(id));
const unknownMappings = [...mappingIds].filter((id) => !expectedIds.has(id));
if (missingMappings.length || unknownMappings.length) throw new Error(`mapping mismatch: missing=${missingMappings.join(',')} unknown=${unknownMappings.join(',')}`);

const relationIds = Object.values(relationByLocationId);
const relationById = new Map();
const wayById = new Map();
const nodeById = new Map();
for (const regionRelationId of relationIds.slice(0, 5)) {
  const response = await fetch(`${OSM_API_URL}/relation/${regionRelationId}/full.json`, {
    headers: { Accept: 'application/json', 'User-Agent': 'TajikistanMonitor/0.1 geodata-builder' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`OSM API HTTP ${response.status} for relation/${regionRelationId}`);
  const osm = await response.json();
  for (const element of osm.elements) {
    if (element.type === 'relation') relationById.set(element.id, element);
    else if (element.type === 'way') wayById.set(element.id, element);
    else if (element.type === 'node') nodeById.set(element.id, element);
  }
  console.log(`Fetched region relation/${regionRelationId}`);
}
for (let offset = 5; offset < relationIds.length; offset += 5) {
  const batch = relationIds.slice(offset, offset + 5);
  const payloads = await Promise.all(batch.map(async (relationId) => {
    const response = await fetch(`${OSM_API_URL}/relation/${relationId}/full.json`, {
      headers: { Accept: 'application/json', 'User-Agent': 'TajikistanMonitor/0.1 geodata-builder' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`OSM API HTTP ${response.status} for relation/${relationId}`);
    return response.json();
  }));
  for (const osm of payloads) for (const element of osm.elements) {
    if (element.type === 'relation') relationById.set(element.id, element);
    else if (element.type === 'way') wayById.set(element.id, element);
    else if (element.type === 'node') nodeById.set(element.id, element);
  }
  console.log(`Fetched district geometry ${Math.min(offset - 4 + batch.length, relationIds.length - 5)}/${relationIds.length - 5}`);
}
let missingRelations = relationIds.filter((id) => !relationById.has(id));
for (const relationId of missingRelations) {
  const response = await fetch(`${OSM_API_URL}/relation/${relationId}/full.json`, {
    headers: { Accept: 'application/json', 'User-Agent': 'TajikistanMonitor/0.1 geodata-builder' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`OSM API HTTP ${response.status} for relation/${relationId}`);
  const osm = await response.json();
  for (const element of osm.elements) {
    if (element.type === 'relation') relationById.set(element.id, element);
    else if (element.type === 'way') wayById.set(element.id, element);
    else if (element.type === 'node') nodeById.set(element.id, element);
  }
  console.log(`Fetched district relation/${relationId}`);
}
missingRelations = relationIds.filter((id) => !relationById.has(id));
if (missingRelations.length) throw new Error(`OSM relations missing: ${missingRelations.join(', ')}`);

const features = adminLocations.map((location) => {
  const osmRelationId = relationByLocationId[location.id];
  const relation = relationById.get(osmRelationId);
  return {
    type: 'Feature',
    properties: {
      location_id: location.id, location_type: location.type, parent_id: location.parent_id,
      name_ru: location.name_ru, name_tg: location.name_tg,
      osm_relation_id: osmRelationId, osm_name: relation.tags?.name || '',
      source: OSM_SOURCE, license: 'ODbL-1.0', dataset_date: new Date().toISOString().slice(0, 10),
    },
    geometry: relationGeometry(relation, wayById, nodeById),
  };
});

const collection = { type: 'FeatureCollection', properties: { source: OSM_SOURCE, license: 'ODbL-1.0' }, features };
await mkdir(resolve('src/data/geography'), { recursive: true });
await mkdir(resolve('data/geography'), { recursive: true });
const serialized = `${JSON.stringify(collection)}\n`;
await writeFile(OUTPUT_PATH, serialized, 'utf8');
await writeFile(OUTPUT_PATH.replace(/\.json$/, '.geojson'), serialized, 'utf8');

const nameDifferences = features.filter((feature) => ![feature.properties.name_ru, feature.properties.name_tg].includes(feature.properties.osm_name));
await writeFile(REPORT_PATH, `# Administrative boundary reconciliation\n\nGenerated: ${new Date().toISOString()}\n\n- Canonical regions: 5\n- Canonical districts: 47\n- Matched OSM relations: ${features.length}\n- Geometry source: OpenStreetMap via Overpass (ODbL 1.0)\n- Name differences requiring human review: ${nameDifferences.length}\n\n## Name differences\n\n${nameDifferences.length ? nameDifferences.map(({ properties }) => `- ${properties.location_id}: canonical RU/TJ = ${properties.name_ru} / ${properties.name_tg}; OSM = ${properties.osm_name}; relation/${properties.osm_relation_id}`).join('\n') : '- None'}\n\nOSM relation IDs are explicit and must be reviewed if an upstream relation is replaced. Official documents remain authoritative for names and hierarchy; OSM supplies geometry only.\n`, 'utf8');
console.log(JSON.stringify({ features: features.length, nameDifferences: nameDifferences.length, output: OUTPUT_PATH }, null, 2));
