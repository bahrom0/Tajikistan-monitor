import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE_URL = 'https://download.geofabrik.de/asia/tajikistan.poly';
const EXPECTED_BBOX = [67.2, 36.6, 75.3, 41.1];
const OUTPUTS = [
  ['low', 0.035],
  ['medium', 0.012],
  ['high', 0.003],
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parsePoly(text) {
  const rings = [];
  let ring = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === 'none') continue;
    if (/^!?\d+$/.test(line)) {
      if (ring.length) rings.push(ring);
      ring = [];
      continue;
    }
    if (line === 'END') {
      if (ring.length) rings.push(ring);
      ring = [];
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) ring.push(parts);
  }
  if (ring.length) rings.push(ring);
  if (!rings.length) throw new Error('Geofabrik .poly does not contain coordinate rings');
  return rings.map(closeRing);
}

function closeRing(ring) {
  const first = ring[0];
  const last = ring.at(-1);
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplifyOpen(points, tolerance) {
  if (points.length <= 2) return points;
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], points[0], points.at(-1));
    if (distance > farthest) {
      farthest = distance;
      index = i;
    }
  }
  if (farthest <= tolerance) return [points[0], points.at(-1)];
  const left = simplifyOpen(points.slice(0, index + 1), tolerance);
  const right = simplifyOpen(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyRing(ring, tolerance) {
  const open = ring.slice(0, -1);
  const anchor = open.reduce((best, point, index) => (point[0] < open[best][0] ? index : best), 0);
  const rotated = [...open.slice(anchor), ...open.slice(0, anchor), open[anchor]];
  const simplified = simplifyOpen(rotated, tolerance);
  if (simplified.length < 4) throw new Error(`Simplification tolerance ${tolerance} collapsed a ring`);
  return closeRing(simplified);
}

function orientation(a, b, c) {
  return Math.sign((b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]));
}

function segmentsIntersect(a, b, c, d) {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

function validateRings(rings) {
  const points = rings.flat();
  const bbox = [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1])),
  ];
  if (bbox[0] < EXPECTED_BBOX[0] || bbox[1] < EXPECTED_BBOX[1] || bbox[2] > EXPECTED_BBOX[2] || bbox[3] > EXPECTED_BBOX[3]) {
    throw new Error(`Boundary bbox ${bbox.join(',')} is outside the Tajikistan guardrail`);
  }
  for (const ring of rings) {
    if (ring.length < 4) throw new Error('A polygon ring has fewer than four coordinates');
    for (let i = 0; i < ring.length - 1; i += 1) {
      for (let j = i + 2; j < ring.length - 1; j += 1) {
        if (i === 0 && j === ring.length - 2) continue;
        if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
          throw new Error(`Self-intersection found between segments ${i} and ${j}`);
        }
      }
    }
  }
  return bbox;
}

function feature(rings, resolution, bbox) {
  return {
    type: 'Feature',
    properties: {
      id: 'country-tj',
      name_ru: 'Таджикистан',
      name_tg: 'Тоҷикистон',
      resolution,
      source: SOURCE_URL,
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors, Geofabrik',
      bbox,
    },
    geometry: rings.length === 1
      ? { type: 'Polygon', coordinates: rings }
      : { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) },
  };
}

async function loadSource(sourcePath) {
  if (sourcePath) return readFile(resolve(sourcePath), 'utf8');
  const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'TajikistanMonitor/0.1 geodata-builder' } });
  if (!response.ok) throw new Error(`Geofabrik returned HTTP ${response.status}`);
  return response.text();
}

const outputDirectory = resolve(arg('--out') ?? 'src/data/geography');
const sourceText = await loadSource(arg('--source'));
const sourceRings = parsePoly(sourceText);
await mkdir(outputDirectory, { recursive: true });

for (const [resolution, tolerance] of OUTPUTS) {
  const rings = sourceRings.map((ring) => simplifyRing(ring, tolerance));
  const bbox = validateRings(rings);
  const output = resolve(outputDirectory, `tajikistan-boundary-${resolution}.geojson`);
  await mkdir(dirname(output), { recursive: true });
  const serialized = `${JSON.stringify(feature(rings, resolution, bbox))}\n`;
  await writeFile(output, serialized, 'utf8');
  await writeFile(resolve(outputDirectory, `tajikistan-boundary-${resolution}.json`), serialized, 'utf8');
  console.log(`${resolution}: ${rings.reduce((sum, ring) => sum + ring.length, 0)} points -> ${output}`);
}
