import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { locations, OFFICIAL_2025_URL, ADLIA_URL } from './official-locations.source.mjs';

const OSM_LICENSE = 'ODbL-1.0';
const normalize = (value = '') => value.toLocaleLowerCase('ru-RU').normalize('NFKD').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function osmRows(payload) {
  return payload.elements.flatMap((element) => {
    const longitude = element.lon ?? element.center?.lon;
    const latitude = element.lat ?? element.center?.lat;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
    const names = [element.tags?.name, element.tags?.['name:ru'], element.tags?.['name:tg'], element.tags?.old_name].filter(Boolean);
    return [{
      osm_id: `${element.type}/${element.id}`,
      longitude,
      latitude,
      names,
      keys: new Set(names.map(normalize)),
      kind: element.tags?.place,
      preferred: element.type === 'node' ? 2 : 1,
    }];
  });
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideBoundary(row, boundary) {
  if (!boundary) return true;
  const polygons = boundary.geometry.type === 'Polygon' ? [boundary.geometry.coordinates] : boundary.geometry.coordinates;
  return polygons.some((polygon) => pointInRing([row.longitude, row.latitude], polygon[0]));
}

function matchLocation(location, rows) {
  if (!['city', 'town'].includes(location.type)) return null;
  const keys = [location.osm_name, location.name_tg, location.name_ru].filter(Boolean).map(normalize);
  const matches = rows.filter((row) => keys.some((key) => row.keys.has(key)));
  matches.sort((a, b) => b.preferred - a.preferred);
  return matches[0] ?? null;
}

const osmPath = arg('--osm');
const boundaryPath = arg('--boundary');
const outputPath = resolve(arg('--out') ?? 'src/data/geography/locations.json');
const boundary = boundaryPath ? JSON.parse(await readFile(resolve(boundaryPath), 'utf8')) : null;
const rows = osmPath ? osmRows(JSON.parse(await readFile(resolve(osmPath), 'utf8'))).filter((row) => insideBoundary(row, boundary)) : [];
const output = locations.map((location) => {
  const match = matchLocation(location, rows);
  const { osm_name: _osmName, coordinates, ...clean } = location;
  const longitude = coordinates?.[0] ?? match?.longitude ?? null;
  const latitude = coordinates?.[1] ?? match?.latitude ?? null;
  return {
    ...clean,
    longitude,
    latitude,
    osm_id: coordinates ? null : match?.osm_id ?? null,
    coordinate_license: longitude !== null ? OSM_LICENSE : null,
  };
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  schema_version: 1,
  release_status: 'draft_reconciled',
  generated_at: new Date().toISOString(),
  official_sources: [OFFICIAL_2025_URL, ADLIA_URL],
  coordinate_source: 'https://download.geofabrik.de/asia/tajikistan.html',
  locations: output,
}, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output.length} locations (${output.filter((item) => item.longitude !== null).length} with OSM coordinates) to ${outputPath}`);
