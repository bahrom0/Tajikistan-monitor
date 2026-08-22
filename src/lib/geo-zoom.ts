import type { CanonicalLocation, LocationType } from '../data/cities';
import administrativeBoundaries from '../data/geography/administrative-boundaries.json';

export type Position = [number, number];

export type AdministrativeGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

export type AdministrativeFeature = {
  properties?: {
    location_id?: string;
    location_type?: 'region' | 'district' | 'city';
    parent_id?: string | null;
    name_ru?: string;
    name_tg?: string;
  };
  geometry: AdministrativeGeometry;
};

/**
 * Calculates geodesic area of a polygon ring in square kilometers (km²)
 * scaled by average latitude to compensate for spherical distortion.
 */
export function ringAreaSqKm(ring: Position[]): number {
  if (!ring || ring.length < 3) return 0;
  let avgLat = 0;
  for (const pt of ring) avgLat += pt[1];
  avgLat = (avgLat / ring.length) * (Math.PI / 180);

  const latScale = 111.139; // km per degree latitude
  const lngScale = 111.139 * Math.cos(avgLat); // km per degree longitude

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

/**
 * Calculates the total area in km² for any Polygon or MultiPolygon geometry.
 */
export function getGeometryAreaSqKm(geometry: AdministrativeGeometry): number {
  if (geometry.type === 'Polygon') {
    return ringAreaSqKm(geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, poly) => sum + ringAreaSqKm(poly[0]), 0);
  }
  return 0;
}

/**
 * Calibrated geographic and urban footprint areas for cities without explicit OSM polygon extract (in km²).
 */
const ESTIMATED_AREAS_SQ_KM: Record<string, number> = {
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

/**
 * Calibrated areas for prominent district administrative center towns and settlements (in km²).
 */
const PROMINENT_TOWN_AREAS: Record<string, number> = {
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
  'town-zafarobod': 12,
  'town-buston-mastchoh': 12,
  'town-adrasmon': 10,
  'town-abdurahmoni-jomi': 12,
  'town-dusti': 11,
  'town-panj': 11,
  'town-shahritus': 11,
  'town-qubodiyon': 11,
  'town-vose': 12,
  'town-muminobod': 10,
  'town-khovaling': 10,
  'town-baljuvon': 9,
  'town-temurmalik': 10,
};

/**
 * Calculates or retrieves the geographic area (in km²) for any canonical location.
 */
export function calculateLocationArea(
  location: CanonicalLocation,
  features: AdministrativeFeature[] = administrativeBoundaries.features as unknown as AdministrativeFeature[],
): number {
  // 1. Check if an official polygon feature exists in administrative boundaries
  const feature = features.find((candidate) => candidate.properties?.location_id === location.id);
  if (feature?.geometry) {
    const geoArea = getGeometryAreaSqKm(feature.geometry);
    if (geoArea > 0) return Math.round(geoArea * 10) / 10;
  }

  // 2. Check calibrated area tables for cities and towns
  if (ESTIMATED_AREAS_SQ_KM[location.id]) {
    return ESTIMATED_AREAS_SQ_KM[location.id];
  }
  if (PROMINENT_TOWN_AREAS[location.id]) {
    return PROMINENT_TOWN_AREAS[location.id];
  }

  // 3. Sensible defaults by location type
  if (location.type === 'region') return 10000;
  if (location.type === 'district') return 1500;
  if (location.type === 'city') return 20;
  return 8; // Default town / settlement area ~ 8 km²
}

/**
 * Determines the exact map zoom level at which a location's label and marker appear.
/**
 * The 4 primary territorial regions of Tajikistan displayed at the farthest zoom.
 */
export const MAIN_FOUR_REGIONS = new Set([
  'region-gbao',
  'region-sughd',
  'region-khatlon',
  'region-rrp',
]);

/**
 * Determines the exact map zoom level at which a location's label and marker appear.
 *
 * Rules:
 * 1. Far zoom (< 5.8): ONLY the 4 main regions (GBAO, Sughd, Khatlon, RRP) are visible.
 * 2. Near zoom (>= 5.8): Capital Dushanbe, Districts, Cities, and Towns appear strictly based on their area:
 *    - Larger areas appear earlier (lower zoom).
 *    - Smaller areas appear later (higher zoom).
 * 3. Safe clamp: All settlements appear by max threshold zoom (8.5), ensuring small towns
 *    remain clearly visible and accessible without shrinking away.
 */
export function getLocationVisibilityZoom(
  areaSqKm: number,
  type: LocationType,
  isCapitalOrMajor = false,
  locationId?: string,
): number {
  if (type === 'region') {
    // Only the 4 territorial regions are visible at the farthest zoom (< 6.0)
    if (locationId && MAIN_FOUR_REGIONS.has(locationId)) {
      return 4.8;
    }
    if (locationId === 'region-dushanbe') {
      return 6.0; // Dushanbe region appears alongside capital city at zoom 6.0
    }
    return 4.8;
  }

  // Base threshold where non-region locations begin appearing
  const BASE_NON_REGION_ZOOM = 6.0;
  // Maximum threshold where even the smallest settlement is fully shown
  const MAX_THRESHOLD_ZOOM = 8.5;

  if (isCapitalOrMajor) {
    return BASE_NON_REGION_ZOOM;
  }

  // Logarithmic mapping from area (40,000 km² down to 3 km²) to zoom range [BASE_NON_REGION_ZOOM, MAX_THRESHOLD_ZOOM]
  const clampedArea = Math.max(3, Math.min(areaSqKm, 40000));
  const logMax = Math.log10(40000); // ~4.602
  const logMin = Math.log10(3);     // ~0.477
  const ratio = (logMax - Math.log10(clampedArea)) / (logMax - logMin); // 0 (largest) to 1 (smallest)

  let zoom = BASE_NON_REGION_ZOOM + ratio * (MAX_THRESHOLD_ZOOM - BASE_NON_REGION_ZOOM);

  // Structural boundaries for types to preserve clean hierarchy:
  if (type === 'district') {
    zoom = Math.min(zoom, 7.8);
  } else if (type === 'city') {
    zoom = Math.min(zoom, 8.0);
  } else if (type === 'town') {
    // Towns start appearing as we zoom in (>= 7.5), fully shown by 8.5
    zoom = Math.max(7.5, Math.min(zoom, MAX_THRESHOLD_ZOOM));
  }

  return Math.round(zoom * 100) / 100;
}
