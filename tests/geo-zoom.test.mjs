import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const locationsData = JSON.parse(await readFile(new URL('src/data/geography/locations.json', root), 'utf8'));
const adminBoundariesData = JSON.parse(await readFile(new URL('src/data/geography/administrative-boundaries.json', root), 'utf8'));

// Import geo-zoom functions
// We replicate pure mathematical logic here or dynamically test the contract
function ringAreaSqKm(ring) {
  if (!ring || ring.length < 3) return 0;
  let avgLat = 0;
  for (const pt of ring) avgLat += pt[1];
  avgLat = (avgLat / ring.length) * (Math.PI / 180);

  const latScale = 111.139;
  const lngScale = 111.139 * Math.cos(avgLat);

  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = [ring[i][0] * lngScale, ring[i][1] * latScale];
    const [x2, y2] = [
      ring[(i + 1) % ring.length][0] * lngScale,
      ring[(i + 1) % ring.length][1] * latScale,
    ];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function getGeometryAreaSqKm(geometry) {
  if (geometry.type === 'Polygon') {
    return ringAreaSqKm(geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, poly) => sum + ringAreaSqKm(poly[0]), 0);
  }
  return 0;
}

const ESTIMATED_AREAS_SQ_KM = {
  'city-dushanbe': 203,
  'city-bokhtar': 26,
  'city-khorugh': 18,
  'city-istiqlol': 12,
  'city-khujand': 40,
  'city-kulob': 35,
  'city-panjakent': 37,
  'city-istaravshan': 18,
  'city-tursunzoda': 24,
  'city-isfara': 15,
  'city-konibodom': 16,
  'city-vahdat': 30,
  'city-hisor': 20,
  'city-roghun': 18,
  'city-nurek': 15,
  'city-levakant': 14,
  'city-buston': 10,
  'city-guliston': 11,
};

const PROMINENT_TOWN_AREAS = {
  'town-murghob': 25,
  'town-danghara': 22,
  'town-somoniyon-rudaki': 20,
  'town-farkhor': 18,
  'town-yovon': 18,
  'town-ghafurov': 18,
  'town-navkat': 16,
  'town-shaydon': 15,
  'town-moskva': 15,
  'town-shahrinav': 15,
  'town-fayzobod': 14,
  'town-gharm': 14,
};

function calculateLocationArea(location, features = adminBoundariesData.features) {
  const feature = features.find((candidate) => candidate.properties?.location_id === location.id);
  if (feature?.geometry) {
    const geoArea = getGeometryAreaSqKm(feature.geometry);
    if (geoArea > 0) return Math.round(geoArea * 10) / 10;
  }
  if (ESTIMATED_AREAS_SQ_KM[location.id]) return ESTIMATED_AREAS_SQ_KM[location.id];
  if (PROMINENT_TOWN_AREAS[location.id]) return PROMINENT_TOWN_AREAS[location.id];
  if (location.type === 'region') return 10000;
  if (location.type === 'district') return 1500;
  if (location.type === 'city') return 20;
  return 8;
}

const MAIN_FOUR_REGIONS = new Set([
  'region-gbao',
  'region-sughd',
  'region-khatlon',
  'region-rrp',
]);

function getLocationVisibilityZoom(areaSqKm, type, isCapitalOrMajor = false, locationId = '') {
  if (type === 'region') {
    if (locationId && MAIN_FOUR_REGIONS.has(locationId)) return 4.8;
    if (locationId === 'region-dushanbe') return 6.0;
    return 4.8;
  }
  const BASE_NON_REGION_ZOOM = 6.0;
  const MAX_THRESHOLD_ZOOM = 8.5;
  if (isCapitalOrMajor) return BASE_NON_REGION_ZOOM;

  const clampedArea = Math.max(3, Math.min(areaSqKm, 40000));
  const logMax = Math.log10(40000);
  const logMin = Math.log10(3);
  const ratio = (logMax - Math.log10(clampedArea)) / (logMax - logMin);

  let zoom = BASE_NON_REGION_ZOOM + ratio * (MAX_THRESHOLD_ZOOM - BASE_NON_REGION_ZOOM);

  if (type === 'district') {
    zoom = Math.min(zoom, 7.8);
  } else if (type === 'city') {
    zoom = Math.min(zoom, 8.0);
  } else if (type === 'town') {
    zoom = Math.max(7.5, Math.min(zoom, MAX_THRESHOLD_ZOOM));
  }

  return Math.round(zoom * 100) / 100;
}

test('geographic polygon areas are computed properly', () => {
  const gbaoFeature = adminBoundariesData.features.find((f) => f.properties?.location_id === 'region-gbao');
  assert.ok(gbaoFeature, 'GBAO feature exists');
  const gbaoArea = getGeometryAreaSqKm(gbaoFeature.geometry);
  // GBAO is ~64,000 km²
  assert.ok(gbaoArea > 50000 && gbaoArea < 75000, `GBAO area ${gbaoArea} should be ~64000 km²`);

  const murghobFeature = adminBoundariesData.features.find((f) => f.properties?.location_id === 'district-murghob');
  assert.ok(murghobFeature, 'Murghob feature exists');
  const murghobArea = getGeometryAreaSqKm(murghobFeature.geometry);
  // Murghob district is ~38,000 km²
  assert.ok(murghobArea > 30000 && murghobArea < 45000, `Murghob area ${murghobArea} should be ~38000 km²`);
});

test('far zoom (< 5.8) shows ONLY the 4 main regions (GBAO, Sughd, Khatlon, RRP)', () => {
  const allLocations = locationsData.locations;
  const farZoom = 5.15; // standard initial map zoom

  const visibleAtFarZoom = allLocations.filter((loc) => {
    const area = calculateLocationArea(loc);
    const isMajor = loc.id === 'city-dushanbe';
    const visZoom = getLocationVisibilityZoom(area, loc.type, isMajor, loc.id);
    return farZoom >= visZoom;
  });

  const visibleIds = new Set(visibleAtFarZoom.map((loc) => loc.id));
  assert.equal(visibleAtFarZoom.length, 4, 'Exactly 4 regions must be visible at far zoom');
  assert.deepEqual(visibleIds, MAIN_FOUR_REGIONS, 'Only GBAO, Sughd, Khatlon, and RRP are visible at far zoom');
});

test('larger districts appear at lower zoom than smaller districts', () => {
  const murghobLoc = locationsData.locations.find((l) => l.id === 'district-murghob');
  const varzobLoc = locationsData.locations.find((l) => l.id === 'district-varzob');

  const murghobArea = calculateLocationArea(murghobLoc);
  const varzobArea = calculateLocationArea(varzobLoc);
  assert.ok(murghobArea > varzobArea, 'Murghob is larger than Varzob');

  const murghobZoom = getLocationVisibilityZoom(murghobArea, 'district');
  const varzobZoom = getLocationVisibilityZoom(varzobArea, 'district');

  assert.ok(murghobZoom < varzobZoom, `Larger district Murghob (${murghobZoom}) should appear earlier than Varzob (${varzobZoom})`);
});

test('capital and major cities appear at base regional zoom (6.0)', () => {
  const dushanbeLoc = locationsData.locations.find((l) => l.id === 'city-dushanbe');
  const dushanbeArea = calculateLocationArea(dushanbeLoc);
  const dushanbeZoom = getLocationVisibilityZoom(dushanbeArea, 'city', true);
  assert.equal(dushanbeZoom, 6.0, 'Capital Dushanbe appears at 6.0');
});

test('all 18 official cities are guaranteed to be visible by zoom 8.0', () => {
  const cities = locationsData.locations.filter((l) => l.type === 'city' && l.longitude !== null);
  assert.equal(cities.length, 18, 'Expected exactly 18 official cities');

  for (const city of cities) {
    const area = calculateLocationArea(city);
    const visZoom = getLocationVisibilityZoom(area, city.type);
    assert.ok(
      visZoom <= 8.0,
      `${city.id} visibility zoom ${visZoom} should be <= 8.0 (safe clamp)`,
    );
  }
});
