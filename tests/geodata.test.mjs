import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const locations = JSON.parse(await readFile(new URL('src/data/geography/locations.json', root), 'utf8'));
const boundary = JSON.parse(await readFile(new URL('src/data/geography/tajikistan-boundary-medium.geojson', root), 'utf8'));
const administrative = JSON.parse(await readFile(new URL('src/data/geography/administrative-boundaries.geojson', root), 'utf8'));

const ringContains = (ring, [longitude, latitude]) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crosses = (currentLatitude > latitude) !== (previousLatitude > latitude)
      && longitude < ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
        / (previousLatitude - currentLatitude) + currentLongitude;
    if (crosses) inside = !inside;
  }
  return inside;
};

const geometryContains = (geometry, point) => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outerRing]) => ringContains(outerRing, point));
};

test('canonical location IDs and parents are valid', () => {
  const rows = locations.locations;
  const ids = new Set(rows.map((row) => row.id));
  assert.equal(ids.size, rows.length);
  assert.deepEqual(
    Object.fromEntries(['region', 'district', 'city', 'town'].map((type) => [type, rows.filter((row) => row.type === type).length])),
    { region: 5, district: 47, city: 18, town: 60 },
  );
  for (const row of rows) if (row.parent_id) assert.ok(ids.has(row.parent_id), `${row.id} has unknown parent`);
});

test('all 18 official cities have coordinates', () => {
  const cities = locations.locations.filter((row) => row.type === 'city');
  assert.equal(cities.length, 18);
  for (const city of cities) {
    assert.equal(typeof city.longitude, 'number', `${city.id} longitude`);
    assert.equal(typeof city.latitude, 'number', `${city.id} latitude`);
  }
});

test('country boundary is sourced and bounded', () => {
  assert.equal(boundary.type, 'Feature');
  assert.equal(boundary.properties.license, 'ODbL-1.0');
  assert.match(boundary.properties.source, /geofabrik/);
  const [west, south, east, north] = boundary.properties.bbox;
  assert.ok(west >= 67.2 && south >= 36.6 && east <= 75.3 && north <= 41.1);
});

test('administrative boundaries match canonical IDs', () => {
  assert.equal(administrative.type, 'FeatureCollection');
  assert.equal(administrative.features.length, 66);
  assert.deepEqual(
    Object.fromEntries(['region', 'district', 'city'].map((type) => [type, administrative.features.filter((feature) => feature.properties.location_type === type).length])),
    { region: 5, district: 47, city: 14 },
  );
  const expectedCityJurisdictions = new Set([
    'city-isfara', 'city-konibodom', 'city-panjakent', 'city-istaravshan',
    'city-hisor', 'city-roghun', 'city-levakant', 'city-tursunzoda',
    'city-kulob', 'city-nurek', 'city-vahdat', 'city-khujand',
    'city-buston', 'city-guliston',
  ]);
  const expectedIds = new Set(locations.locations
    .filter(({ id, type }) => type === 'region' || type === 'district' || expectedCityJurisdictions.has(id))
    .map(({ id }) => id));
  assert.deepEqual(new Set(administrative.features.map(({ properties }) => properties.location_id)), expectedIds);
  for (const feature of administrative.features) {
    assert.match(feature.properties.source, /openstreetmap/);
    assert.equal(feature.properties.license, 'ODbL-1.0');
    assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
    if (feature.properties.location_type === 'city') {
      const city = locations.locations.find(({ id }) => id === feature.properties.location_id);
      assert.ok(city, `${feature.properties.location_id} is missing from canonical locations`);
      assert.ok(
        geometryContains(feature.geometry, [city.longitude, city.latitude]),
        `${feature.properties.location_id} marker is outside its administrative polygon`,
      );
    }
  }
});
