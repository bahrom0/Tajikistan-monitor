import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cities, locations, type CanonicalLocation } from '../data/cities';
import {
  LocationLayerControls,
  type LocationPoint,
} from './LocationLayerControls';
import administrativeBoundaries from '../data/geography/administrative-boundaries.json';
import type { NewsItem } from '../types';

type Position = [number, number];
type AdministrativeGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };
type AdministrativeFeature = {
  properties?: {
    location_id?: string;
    location_type?: 'region' | 'district' | 'city';
    parent_id?: string | null;
    name_ru?: string;
    name_tg?: string;
  };
  geometry: AdministrativeGeometry;
};

const administrativeFeatures = administrativeBoundaries.features as unknown as AdministrativeFeature[];

const REGION_COLORS: Record<string, string> = {
  'region-gbao': '#315d8a',
  'region-sughd': '#76538f',
  'region-khatlon': '#9a553f',
  'region-dushanbe': '#2f8177',
  'region-rrp': '#718246',
};

const REGION_LABELS: Record<string, string> = {
  'region-gbao': 'ГБАО',
  'region-sughd': 'СОГД',
  'region-khatlon': 'ХАТЛОН',
  'region-dushanbe': 'ДУШАНБЕ',
  'region-rrp': 'РРП',
};

const INITIAL_MAP_CENTER: Position = [70.72, 38.55];
const INITIAL_MAP_ZOOM = 5.15;

const ringArea = (ring: Position[]) => ring.reduce((area, point, index) => {
  const next = ring[(index + 1) % ring.length];
  return area + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;

const ringCentroid = (ring: Position[]): Position => {
  const area = ringArea(ring);
  if (Math.abs(area) < 1e-9) {
    const sum = ring.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const point = ring[index];
    const next = ring[(index + 1) % ring.length];
    const factor = point[0] * next[1] - next[0] * point[1];
    x += (point[0] + next[0]) * factor;
    y += (point[1] + next[1]) * factor;
  }
  return [x / (6 * area), y / (6 * area)];
};

const representativePoint = (geometry: AdministrativeGeometry): Position => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const largestOuterRing = polygons
    .map((polygon) => polygon[0])
    .reduce((largest, ring) => (
      Math.abs(ringArea(ring)) > Math.abs(ringArea(largest)) ? ring : largest
    ));
  return ringCentroid(largestOuterRing);
};

const geometryBounds = (geometry: AdministrativeGeometry): [Position, Position] => {
  const positions: Position[] = geometry.type === 'Polygon'
    ? geometry.coordinates.flat()
    : geometry.coordinates.flat(2);
  const first = positions[0];
  return positions.reduce<[Position, Position]>(([[minLng, minLat], [maxLng, maxLat]], [lng, lat]) => [
    [Math.min(minLng, lng), Math.min(minLat, lat)],
    [Math.max(maxLng, lng), Math.max(maxLat, lat)],
  ], [[first[0], first[1]], [first[0], first[1]]]);
};

const buildCountryOutline = () => {
  const edges = new Map<string, { count: number; coordinates: [Position, Position] }>();
  const features = administrativeFeatures
    .filter((feature) => feature.properties?.location_type === 'region');

  for (const feature of features) {
    const rings = feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates
      : feature.geometry.coordinates.flat();
    for (const ring of rings) {
      for (let index = 1; index < ring.length; index += 1) {
        const start = ring[index - 1];
        const end = ring[index];
        const startKey = start.join(',');
        const endKey = end.join(',');
        const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
        const edge = edges.get(key);
        if (edge) edge.count += 1;
        else edges.set(key, { count: 1, coordinates: [start, end] });
      }
    }
  }

  const exteriorEdges = [...edges.values()].filter((edge) => edge.count === 1);
  const adjacency = new Map<string, number[]>();
  const positionKey = (position: Position) => position.join(',');
  exteriorEdges.forEach((edge, edgeIndex) => {
    for (const position of edge.coordinates) {
      const key = positionKey(position);
      const connected = adjacency.get(key) ?? [];
      connected.push(edgeIndex);
      adjacency.set(key, connected);
    }
  });

  const visited = new Set<number>();
  const lines: Position[][] = [];
  const walkLine = (firstEdgeIndex: number, firstPosition: Position) => {
    const line: Position[] = [firstPosition];
    let edgeIndex = firstEdgeIndex;
    let cursor = firstPosition;
    while (!visited.has(edgeIndex)) {
      visited.add(edgeIndex);
      const [start, end] = exteriorEdges[edgeIndex].coordinates;
      const next = positionKey(start) === positionKey(cursor) ? end : start;
      line.push(next);
      cursor = next;
      const nextEdge = (adjacency.get(positionKey(cursor)) ?? [])
        .find((candidate) => !visited.has(candidate));
      if (nextEdge === undefined) break;
      edgeIndex = nextEdge;
    }
    if (line.length > 1) lines.push(line);
  };

  exteriorEdges.forEach((edge, edgeIndex) => {
    if (visited.has(edgeIndex)) return;
    const endpoint = edge.coordinates.find((position) => (
      (adjacency.get(positionKey(position))?.length ?? 0) !== 2
    ));
    walkLine(edgeIndex, endpoint ?? edge.coordinates[0]);
  });

  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'MultiLineString' as const,
      coordinates: lines,
    },
  };
};

const administrativeCountryOutline = buildCountryOutline();

type MarkerRecord = {
  marker: maplibregl.Marker;
  location: LocationPoint;
};

type AdministrativeLabelRecord = {
  element: HTMLElement;
  type: 'region' | 'district';
  priority: number;
  locationId: string;
};

type MapViewState = {
  showCities: boolean;
  regionId: string;
  districtId: string;
  selectedLocationId: string | null;
};

const regions = locations.filter((location) => location.type === 'region');
const districts = locations.filter((location) => location.type === 'district');
// Small settlements stay in the canonical dataset for article geolocation,
// but the public map intentionally shows only official cities.
const pointLocations: LocationPoint[] = cities;
const locationById = new Map<string, CanonicalLocation>(locations.map((location) => [location.id, location]));
const CITY_VISIBILITY_ZOOM = 5.9;
const CITY_LABEL_VISIBILITY_ZOOM = 6.85;
const REGION_LABEL_MAX_ZOOM = 5.8;
const DISTRICT_LABEL_MIN_ZOOM = 5.65;
const DISTRICT_COLLISION_MAX_ZOOM = 7.5;

const DEFAULT_AREA_COLOR = '#4fa98f';

const areaColorForParent = (parentId: string | null | undefined) => {
  const visited = new Set<string>();
  let currentId = parentId ?? null;

  while (currentId && !visited.has(currentId)) {
    const regionColor = REGION_COLORS[currentId];
    if (regionColor) return regionColor;
    visited.add(currentId);
    currentId = locationById.get(currentId)?.parent_id ?? null;
  }

  return DEFAULT_AREA_COLOR;
};

const areaColorForLocation = (location: Pick<CanonicalLocation, 'parent_id'>) => (
  areaColorForParent(location.parent_id)
);

const cityColors = new Map(cities.map((location) => [
  location.id,
  areaColorForLocation(location),
]));
const cityAreaColorExpression = [
  'match',
  ['get', 'location_id'],
  ...cities.flatMap((location) => [location.id, cityColors.get(location.id) ?? '#4fa98f']),
  DEFAULT_AREA_COLOR,
] as unknown as maplibregl.ExpressionSpecification;
const locationMarkerColor = (location: LocationPoint) => (
  cityColors.get(location.id) ?? areaColorForLocation(location)
);

const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase('ru-RU').normalize('NFKC');

const hasAncestor = (location: LocationPoint, ancestorId: string) => {
  const visited = new Set<string>();
  let parentId = location.parent_id;
  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = locationById.get(parentId)?.parent_id ?? null;
  }
  return false;
};

const isInHierarchy = (location: LocationPoint, regionId: string, districtId: string) => (
  (regionId === 'all' || hasAncestor(location, regionId))
  && (districtId === 'all' || hasAncestor(location, districtId))
);

const locationTypeLabel = (type: CanonicalLocation['type']) => ({
  region: 'Область / Вилоят',
  district: 'Район / Ноҳия',
  city: 'Город / Шаҳр',
  town: 'Посёлок / Шаҳрак',
}[type]);

const getParentLabel = (location: CanonicalLocation) => {
  const parent = location.parent_id ? locationById.get(location.parent_id) : undefined;
  return parent ? `${parent.name_ru} / ${parent.name_tg}` : 'Таджикистан / Тоҷикистон';
};

const createPopupContent = (location: CanonicalLocation, onResearch?: (selection: PlaceResearchSelection) => void) => {
  const content = document.createElement('div');
  content.className = 'location-popup';

  const nameRu = document.createElement('strong');
  nameRu.textContent = location.name_ru;
  const nameTg = document.createElement('span');
  nameTg.textContent = location.name_tg;
  const type = document.createElement('small');
  type.textContent = `Тип / Навъ: ${locationTypeLabel(location.type)}`;
  const parent = document.createElement('small');
  parent.textContent = `Родитель / Волидайн: ${getParentLabel(location)}`;
  const stableId = document.createElement('small');
  stableId.textContent = `ID: ${location.id}`;
  const coordinates = document.createElement('small');
  coordinates.textContent = location.longitude !== null && location.latitude !== null
    ? `Координаты: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
    : 'Границы: административная геометрия OSM';
  const datasetDate = document.createElement('small');
  datasetDate.textContent = `Набор данных: ${location.dataset_date || 'дата не указана'}`;
  const researchButton = document.createElement('button');
  const periodLabel = document.createElement('label');
  periodLabel.className = 'location-research-period';
  const periodText = document.createElement('span');
  periodText.textContent = 'Период веб-поиска';
  const periodSelect = document.createElement('select');
  periodSelect.setAttribute('aria-label', 'Период поиска новостей в интернете');
  for (const [value, label] of [['7', '7 дней'], ['30', '30 дней'], ['90', '3 месяца'], ['365', '1 год']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === '30';
    periodSelect.append(option);
  }
  periodLabel.append(periodText, periodSelect);
  researchButton.type = 'button';
  researchButton.className = 'location-research-button';
  researchButton.textContent = ({
    region: 'ВСЕ НОВОСТИ ЭТОЙ ОБЛАСТИ',
    district: 'ВСЕ НОВОСТИ ЭТОГО РАЙОНА',
    city: 'ВСЕ НОВОСТИ ЭТОГО ГОРОДА',
    town: 'ВСЕ НОВОСТИ ЭТОГО ПОСЁЛКА',
  })[location.type];
  researchButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onResearch?.({
      locationId: location.id,
      nameRu: location.name_ru,
      nameTg: location.name_tg,
      locationType: location.type,
      parentLabel: getParentLabel(location),
      periodDays: Number(periodSelect.value),
    });
  });

  content.append(nameRu, nameTg, type, parent, stableId, coordinates, datasetDate, periodLabel, researchButton);
  return content;
};

const newsFeatures = (news: NewsItem[]) => {
  const groups = new Map<string, { longitude: number; latitude: number; articles: Array<{ title: string; source: string; severity: string; confidence: number; evidence: string }> }>();
  for (const article of news) for (const location of article.locations ?? []) {
    if (location.confidence < (article.geolocationThreshold ?? 0.78) || location.longitude === null || location.latitude === null) continue;
    const group = groups.get(location.locationId) ?? { longitude: location.longitude, latitude: location.latitude, articles: [] };
    group.articles.push({ title: article.title, source: article.sourceName, severity: article.severity, confidence: location.confidence, evidence: location.evidence });
    groups.set(location.locationId, group);
  }
  return {
    type: 'FeatureCollection' as const,
    features: [...groups.entries()].map(([locationId, group]) => ({
      type: 'Feature' as const,
      properties: {
        location_id: locationId, article_count: group.articles.length,
        severity: group.articles.some(({ severity }) => severity === 'alert') ? 'alert' : 'normal',
        articles_json: JSON.stringify(group.articles.slice(0, 10)),
      },
      geometry: { type: 'Point' as const, coordinates: [group.longitude, group.latitude] },
    })),
  };
};

export type GeographyFilter = { regionId: string; districtId: string };
export type LocationSummarySelection = { locationId: string; nameRu: string; nameTg: string; articles: NewsItem[] };
export type PlaceResearchSelection = { locationId: string; nameRu: string; nameTg: string; locationType: CanonicalLocation['type']; parentLabel: string; periodDays: number };

export function TajikistanMap({ news = [], onGeographyFilterChange, onLocationSummary, onPlaceResearch }: { news?: NewsItem[]; onGeographyFilterChange?: (filter: GeographyFilter) => void; onLocationSummary?: (selection: LocationSummarySelection) => void; onPlaceResearch?: (selection: PlaceResearchSelection) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRegistryRef = useRef(new Map<string, MarkerRecord>());
  const administrativeLabelRegistryRef = useRef<AdministrativeLabelRecord[]>([]);
  const administrativeLabelFrameRef = useRef<number | null>(null);
  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const mapZoomRef = useRef(INITIAL_MAP_ZOOM);
  const pendingFocusRef = useRef<string | null>(null);
  const newsDataRef = useRef(newsFeatures(news));
  const newsItemsRef = useRef(news);
  const onLocationSummaryRef = useRef(onLocationSummary);
  const onPlaceResearchRef = useRef(onPlaceResearch);
  newsDataRef.current = newsFeatures(news);
  newsItemsRef.current = news;
  onLocationSummaryRef.current = onLocationSummary;
  onPlaceResearchRef.current = onPlaceResearch;
  const [showCities, setShowCities] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState('all');
  const [selectedDistrictId, setSelectedDistrictId] = useState('all');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const viewStateRef = useRef<MapViewState>({
    showCities: true,
    regionId: 'all',
    districtId: 'all',
    selectedLocationId: null,
  });
  viewStateRef.current = {
    showCities,
    regionId: selectedRegionId,
    districtId: selectedDistrictId,
    selectedLocationId,
  };

  const closeActivePopup = () => {
    const popup = activePopupRef.current;
    activePopupRef.current = null;
    popup?.remove();
  };

  const activatePopup = (popup: maplibregl.Popup) => {
    const previousPopup = activePopupRef.current;
    if (previousPopup && previousPopup !== popup) previousPopup.remove();
    activePopupRef.current = popup;
  };

  const clearPopupReference = (popup: maplibregl.Popup) => {
    if (activePopupRef.current === popup) activePopupRef.current = null;
  };

  const focusAdministrativeLocation = (location: CanonicalLocation) => {
    const map = mapRef.current;
    const feature = administrativeFeatures.find(
      (candidate) => candidate.properties?.location_id === location.id,
    );
    if (!map || !feature || (location.type !== 'region' && location.type !== 'district')) return;
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.fitBounds(geometryBounds(feature.geometry), {
      padding: { top: 72, right: 72, bottom: 72, left: 72 },
      maxZoom: location.type === 'district' ? 7.8 : location.id === 'region-dushanbe' ? 8.2 : 6.5,
      duration: prefersReducedMotion ? 0 : 650,
      essential: !prefersReducedMotion,
    });
  };

  const syncMarkerVisibility = () => {
    const state = viewStateRef.current;
    markerRegistryRef.current.forEach(({ marker, location }) => {
      const element = marker.getElement();
      const layerVisible = state.showCities;
      const zoomVisible = mapZoomRef.current >= CITY_VISIBILITY_ZOOM;
      const visible = layerVisible && zoomVisible && isInHierarchy(location, state.regionId, state.districtId);
      const showLabel = mapZoomRef.current >= CITY_LABEL_VISIBILITY_ZOOM;

      element.style.display = visible ? '' : 'none';
      element.tabIndex = visible ? 0 : -1;
      element.setAttribute('aria-hidden', String(!visible));
      element.classList.toggle('label-visible', showLabel);
      element.classList.toggle('is-selected', state.selectedLocationId === location.id);
    });
  };

  const syncAdministrativeLabelVisibility = () => {
    const zoom = mapZoomRef.current;
    administrativeLabelRegistryRef.current.forEach(({ element, type, locationId }) => {
      const visible = type === 'region' || zoom >= DISTRICT_LABEL_MIN_ZOOM;
      element.style.display = visible ? '' : 'none';
      element.tabIndex = visible ? 0 : -1;
      element.setAttribute('aria-hidden', String(!visible));
      element.classList.toggle('compact-admin-label', type === 'region' && zoom >= REGION_LABEL_MAX_ZOOM);
      element.classList.toggle('is-selected', (
        type === 'region' ? viewStateRef.current.regionId : viewStateRef.current.districtId
      ) === locationId);
    });
    if (administrativeLabelFrameRef.current !== null) {
      cancelAnimationFrame(administrativeLabelFrameRef.current);
    }
    administrativeLabelFrameRef.current = requestAnimationFrame(() => {
      const occupied: DOMRect[] = [];
      const districtsByPriority = administrativeLabelRegistryRef.current
        .filter(({ type, element }) => type === 'district' && element.style.display !== 'none')
        .sort((left, right) => right.priority - left.priority);
      districtsByPriority.forEach(({ element }) => {
        element.classList.remove('label-text-hidden');
        if (zoom >= DISTRICT_COLLISION_MAX_ZOOM) return;
        const label = element.querySelector('b');
        if (!label) return;
        const rect = label.getBoundingClientRect();
        const overlaps = occupied.some((placed) => !(
          rect.right + 4 < placed.left
          || rect.left - 4 > placed.right
          || rect.bottom + 3 < placed.top
          || rect.top - 3 > placed.bottom
        ));
        if (overlaps) element.classList.add('label-text-hidden');
        else occupied.push(rect);
      });
      administrativeLabelFrameRef.current = null;
    });
  };

  const syncBoundarySelection = () => {
    const map = mapRef.current;
    if (!map?.getLayer('selected-region-fill')) return;
    const { regionId, districtId } = viewStateRef.current;
    map.setFilter('selected-region-fill', ['==', ['get', 'location_id'], regionId === 'all' ? '__none__' : regionId]);
    map.setFilter('selected-region-line', ['==', ['get', 'location_id'], regionId === 'all' ? '__none__' : regionId]);
    map.setFilter('selected-district-fill', ['==', ['get', 'location_id'], districtId === 'all' ? '__none__' : districtId]);
    map.setFilter('selected-district-line', ['==', ['get', 'location_id'], districtId === 'all' ? '__none__' : districtId]);
    if (map.getLayer('selected-city-fill')) {
      const selectedLocationId = viewStateRef.current.selectedLocationId ?? '__none__';
      map.setFilter('selected-city-fill', ['==', ['get', 'location_id'], selectedLocationId]);
      map.setFilter('selected-city-line', ['==', ['get', 'location_id'], selectedLocationId]);
    }
  };

  const focusLocation = (location: LocationPoint, openPopup = true) => {
    const state = viewStateRef.current;
    state.showCities = true;
    setShowCities(true);
    state.selectedLocationId = location.id;
    setSelectedLocationId(location.id);

    const map = mapRef.current;
    if (!map) {
      pendingFocusRef.current = location.id;
      return;
    }

    const minimumZoom = 6.8;
    const zoom = Math.min(Math.max(map.getZoom(), minimumZoom), map.getMaxZoom());
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyTo({
      center: [location.longitude, location.latitude],
      zoom,
      duration: prefersReducedMotion ? 0 : 650,
      essential: !prefersReducedMotion,
    });

    const record = markerRegistryRef.current.get(location.id);
    if (!record) {
      pendingFocusRef.current = location.id;
      return;
    }

    const element = record.marker.getElement();
    element.style.display = '';
    element.tabIndex = 0;
    element.focus();
    if (openPopup && !record.marker.getPopup()?.isOpen()) record.marker.togglePopup();
  };

  const isLocationSelected = (location: CanonicalLocation) => {
    const state = viewStateRef.current;
    if (location.type === 'city') return state.selectedLocationId === location.id;
    if (location.type === 'district') return state.selectedLocationId === null && state.districtId === location.id;
    if (location.type === 'region') {
      return state.selectedLocationId === null && state.districtId === 'all' && state.regionId === location.id;
    }
    return false;
  };

  const clearLocationSelection = () => {
    closeActivePopup();
    viewStateRef.current.regionId = 'all';
    viewStateRef.current.districtId = 'all';
    viewStateRef.current.selectedLocationId = null;
    setSelectedRegionId('all');
    setSelectedDistrictId('all');
    setSelectedLocationId(null);
    onGeographyFilterChange?.({ regionId: 'all', districtId: 'all' });
    const map = mapRef.current;
    if (map) {
      const prefersReducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.flyTo({
        center: INITIAL_MAP_CENTER,
        zoom: INITIAL_MAP_ZOOM,
        duration: prefersReducedMotion ? 0 : 700,
        essential: !prefersReducedMotion,
      });
    }
    syncMarkerVisibility();
    syncAdministrativeLabelVisibility();
    syncBoundarySelection();
  };

  const searchableLocations = useMemo(() => (
    pointLocations.filter((location) => isInHierarchy(location, selectedRegionId, selectedDistrictId))
  ), [selectedRegionId, selectedDistrictId]);

  const searchResults = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return [];
    return searchableLocations
      .filter((location) => [location.name_ru, location.name_tg].some((name) => normalizeSearch(name).includes(needle)))
      .sort((left, right) => left.name_ru.localeCompare(right.name_ru, 'ru'));
  }, [query, searchableLocations]);

  useEffect(() => {
    syncMarkerVisibility();
    syncAdministrativeLabelVisibility();
    syncBoundarySelection();
  }, [showCities, selectedRegionId, selectedDistrictId, selectedLocationId]);

  useEffect(() => {
    const source = mapRef.current?.getSource('news-locations') as maplibregl.GeoJSONSource | undefined;
    source?.setData(newsDataRef.current);
  }, [news]);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      center: INITIAL_MAP_CENTER,
      zoom: INITIAL_MAP_ZOOM,
      minZoom: 4.5,
      maxZoom: 11,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#071211' } }],
      },
      attributionControl: false,
    });
    mapRef.current = map;
    mapZoomRef.current = map.getZoom();
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://download.geofabrik.de/asia/tajikistan.html" target="_blank" rel="noopener noreferrer">Geofabrik</a>',
    }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    const handleZoom = () => {
      mapZoomRef.current = map.getZoom();
      syncMarkerVisibility();
      syncAdministrativeLabelVisibility();
    };
    map.on('zoom', handleZoom);
    map.on('moveend', syncAdministrativeLabelVisibility);

    map.on('load', () => {
      map.addSource('administrative', { type: 'geojson', data: administrativeBoundaries as maplibregl.GeoJSONSourceSpecification['data'] });
      map.addSource('country-outline', { type: 'geojson', data: administrativeCountryOutline });
      map.addLayer({ id: 'country-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'region'], paint: {
        'fill-color': ['match', ['get', 'location_id'], 'region-gbao', REGION_COLORS['region-gbao'], 'region-sughd', REGION_COLORS['region-sughd'], 'region-khatlon', REGION_COLORS['region-khatlon'], 'region-dushanbe', REGION_COLORS['region-dushanbe'], 'region-rrp', REGION_COLORS['region-rrp'], '#17332c'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4.5, 0.48, 6.2, 0.3, 8, 0.18],
      } });
      map.addLayer({ id: 'districts-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'district'], minzoom: 5.55, paint: {
        'fill-color': ['match', ['get', 'parent_id'], 'region-gbao', REGION_COLORS['region-gbao'], 'region-sughd', REGION_COLORS['region-sughd'], 'region-khatlon', REGION_COLORS['region-khatlon'], 'region-dushanbe', REGION_COLORS['region-dushanbe'], 'region-rrp', REGION_COLORS['region-rrp'], '#17332c'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5.55, 0.08, 7, 0.2, 9, 0.1],
      } });
      map.addLayer({ id: 'cities-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'city'], minzoom: 5.55, paint: {
        'fill-color': cityAreaColorExpression,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5.55, 0.22, 7, 0.34, 9, 0.2],
      } });
      map.addLayer({ id: 'country-glow', type: 'line', source: 'country-outline', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#35f2ac', 'line-width': ['interpolate', ['linear'], ['zoom'], 4.5, 9, 11, 14], 'line-opacity': 0.13, 'line-blur': 7 } });
      map.addLayer({ id: 'regions-hit', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'region'], paint: { 'fill-color': '#35e6a4', 'fill-opacity': 0.01 } });
      map.addLayer({ id: 'districts-hit', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'district'], minzoom: 5.55, paint: { 'fill-color': '#f0c067', 'fill-opacity': 0.01 } });
      map.addLayer({ id: 'cities-hit', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'city'], minzoom: 5.55, paint: { 'fill-color': '#4fe0b4', 'fill-opacity': 0.01 } });
      map.addLayer({ id: 'regions-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_type'], 'region'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#b2e8d6', 'line-width': ['interpolate', ['linear'], ['zoom'], 4.5, 1.8, 8, 2.8], 'line-opacity': 0.82 } });
      map.addLayer({ id: 'districts-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_type'], 'district'], minzoom: 5.55, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#a5cbbf', 'line-width': ['interpolate', ['linear'], ['zoom'], 5.55, 0.9, 8, 1.7, 11, 2.2], 'line-opacity': 0.68 } });
      map.addLayer({ id: 'cities-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_type'], 'city'], minzoom: 5.55, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': cityAreaColorExpression, 'line-width': ['interpolate', ['linear'], ['zoom'], 5.55, 1.4, 8, 2.2, 11, 3], 'line-opacity': 0.95 } });
      map.addLayer({ id: 'selected-region-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'fill-color': '#35e6a4', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'selected-region-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'line-color': '#7effc9', 'line-width': 3, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'selected-district-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'fill-color': '#f0c067', 'fill-opacity': 0.2 } });
      map.addLayer({ id: 'selected-district-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'line-color': '#f0c067', 'line-width': 2.5, 'line-opacity': 1 } });
      map.addLayer({ id: 'selected-city-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'fill-color': '#5fffc4', 'fill-opacity': 0.26 } });
      map.addLayer({ id: 'selected-city-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#8effd5', 'line-width': 3.2, 'line-opacity': 1 } });
      map.addLayer({ id: 'country-line', type: 'line', source: 'country-outline', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#41e7aa', 'line-width': ['interpolate', ['linear'], ['zoom'], 4.5, 2.5, 8, 3.5, 11, 4.5], 'line-opacity': 0.94, 'line-blur': 0.2 } });

      map.addSource('news-locations', { type: 'geojson', data: newsDataRef.current });
      map.addLayer({ id: 'news-location-points', type: 'circle', source: 'news-locations', paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'article_count'], 1, 7, 5, 11, 10, 15], 'circle-color': ['case', ['==', ['get', 'severity'], 'alert'], '#ff765e', '#f0c067'],
        'circle-stroke-color': '#06100e', 'circle-stroke-width': 2, 'circle-opacity': 0.95,
      } });
      const selectAdministrativeLocation = (location: CanonicalLocation, lngLat: maplibregl.LngLatLike) => {
        if (location.id === 'region-dushanbe') {
          const dushanbe = pointLocations.find((candidate) => candidate.id === 'city-dushanbe');
          if (dushanbe) {
            viewStateRef.current.regionId = 'region-dushanbe';
            viewStateRef.current.districtId = 'all';
            setSelectedRegionId('region-dushanbe');
            setSelectedDistrictId('all');
            onGeographyFilterChange?.({ regionId: 'region-dushanbe', districtId: 'all' });
            focusLocation(dushanbe);
            syncBoundarySelection();
            syncAdministrativeLabelVisibility();
            return;
          }
        }
        if (location.type === 'city') {
          const city = pointLocations.find((candidate) => candidate.id === location.id);
          if (!city) return;
          const regionId = location.parent_id || 'all';
          viewStateRef.current.regionId = regionId;
          viewStateRef.current.districtId = 'all';
          setSelectedRegionId(regionId);
          setSelectedDistrictId('all');
          onGeographyFilterChange?.({ regionId, districtId: 'all' });
          focusLocation(city);
          syncBoundarySelection();
          syncAdministrativeLabelVisibility();
          return;
        }
        viewStateRef.current.selectedLocationId = null;
        setSelectedLocationId(null);
        if (location.type === 'region') {
          viewStateRef.current.regionId = location.id;
          viewStateRef.current.districtId = 'all';
          setSelectedRegionId(location.id);
          setSelectedDistrictId('all');
          onGeographyFilterChange?.({ regionId: location.id, districtId: 'all' });
        } else if (location.type === 'district') {
          const regionId = location.parent_id || 'all';
          viewStateRef.current.regionId = regionId;
          viewStateRef.current.districtId = location.id;
          setSelectedRegionId(regionId);
          setSelectedDistrictId(location.id);
          onGeographyFilterChange?.({ regionId, districtId: location.id });
        } else return;
        const feature = administrativeFeatures.find(
          (candidate) => candidate.properties?.location_id === location.id,
        );
        const popupPosition = feature ? representativePoint(feature.geometry) : lngLat;
        focusAdministrativeLocation(location);
        syncBoundarySelection();
        syncAdministrativeLabelVisibility();
        const popup = new maplibregl.Popup({ maxWidth: 'min(300px, calc(100vw - 24px))', className: 'place-map-popup' })
          .setLngLat(popupPosition)
          .setDOMContent(createPopupContent(location, (selection) => onPlaceResearchRef.current?.(selection)));
        activatePopup(popup);
        popup.on('close', () => clearPopupReference(popup));
        popup.addTo(map);
      };
      const handleLocationInteraction = (
        location: CanonicalLocation,
        lngLat: maplibregl.LngLatLike,
      ) => {
        if (isLocationSelected(location)) clearLocationSelection();
        else selectAdministrativeLocation(location, lngLat);
      };
      map.on('click', (event) => {
        if (map.queryRenderedFeatures(event.point, { layers: ['news-location-points'] }).length) {
          return;
        }
        if (viewStateRef.current.showCities && map.getZoom() >= CITY_VISIBILITY_ZOOM) {
          const nearbyCity = pointLocations
            .filter((location) => isInHierarchy(
              location,
              viewStateRef.current.regionId,
              viewStateRef.current.districtId,
            ))
            .map((location) => {
              const point = map.project([location.longitude, location.latitude]);
              return {
                location,
                distance: Math.hypot(point.x - event.point.x, point.y - event.point.y),
              };
            })
            .filter(({ distance }) => distance <= 34)
            .sort((left, right) => left.distance - right.distance)[0]?.location;
          if (nearbyCity) {
            handleLocationInteraction(nearbyCity, event.lngLat);
            return;
          }
        }
        const hitLayers = map.getZoom() >= 5.55 ? ['cities-hit', 'districts-hit', 'regions-hit'] : ['regions-hit'];
        const feature = map.queryRenderedFeatures(event.point, { layers: hitLayers })[0];
        const locationId = String(feature?.properties?.location_id || '');
        const location = locationById.get(locationId);
        if (!location || !['region', 'district', 'city'].includes(location.type)) return;
        handleLocationInteraction(location, event.lngLat);
      });
      map.on('mouseenter', 'regions-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'regions-hit', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'districts-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'districts-hit', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'cities-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'cities-hit', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'news-location-points', (event) => {
        const feature = event.features?.[0];
        if (!feature?.properties || !event.lngLat) return;
        const content = document.createElement('div');
        content.className = 'location-popup news-location-popup';
        const availableBelow = map.getContainer().clientHeight - event.point.y - 28;
        content.style.maxHeight = `${Math.max(160, Math.min(360, availableBelow))}px`;
        const articles = JSON.parse(String(feature.properties.articles_json || '[]')) as Array<{ title: string; source: string; confidence: number; evidence: string }>;
        const articleCount = Number(feature.properties.article_count || articles.length);
        const locationId = String(feature.properties.location_id || '');
        const location = locationById.get(locationId);
        const heading = document.createElement('strong'); heading.textContent = articleCount > 1 ? `${articleCount} новостей в этом месте` : 'Новость в этом месте';
        const list = document.createElement('div');
        list.className = 'news-location-popup-list';
        for (const article of articles) {
          const title = document.createElement('span'); title.textContent = article.title;
          const evidence = document.createElement('small'); evidence.textContent = `${article.source} · ${(article.confidence * 100).toFixed(0)}% · ${article.evidence}`;
          list.append(title, evidence);
        }
        const summaryButton = document.createElement('button');
        summaryButton.type = 'button';
        summaryButton.className = 'location-summary-button';
        summaryButton.textContent = 'СУМАРИ С ИИ';
        summaryButton.setAttribute('aria-label', `Создать сумари ${articleCount} новостей для ${location?.name_ru || 'этого места'}`);
        summaryButton.addEventListener('click', (clickEvent) => {
          clickEvent.stopPropagation();
          const fullArticles = newsItemsRef.current.filter((article) => (article.locations ?? []).some((articleLocation) => (
            articleLocation.locationId === locationId
            && articleLocation.confidence >= (article.geolocationThreshold ?? 0.78)
          )));
          if (!fullArticles.length) return;
          onLocationSummaryRef.current?.({
            locationId,
            nameRu: location?.name_ru || 'Выбранное место',
            nameTg: location?.name_tg || '',
            articles: fullArticles,
          });
        });
        content.append(heading, list, summaryButton);
        const popup = new maplibregl.Popup({
          anchor: 'top',
          offset: 12,
          maxWidth: 'min(320px, calc(100vw - 24px))',
          className: 'news-map-popup',
        }).setLngLat(event.lngLat).setDOMContent(content);
        activatePopup(popup);
        popup.on('close', () => clearPopupReference(popup));
        popup.addTo(map);
      });
      map.on('mouseenter', 'news-location-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'news-location-points', () => { map.getCanvas().style.cursor = ''; });

      administrativeFeatures.forEach((feature) => {
        const type = feature.properties?.location_type;
        const locationId = feature.properties?.location_id;
        if ((type !== 'region' && type !== 'district') || !locationId) return;
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `administrative-map-label ${type}-map-label`;
        element.dataset.locationId = locationId;
        const location = locationById.get(locationId);
        const fullName = feature.properties?.name_ru ?? locationId;
        element.setAttribute('aria-label', `Открыть ${type === 'region' ? 'область' : 'район'}: ${fullName}`);
        element.title = `${fullName} · ${feature.properties?.name_tg ?? ''}`;
        const dot = document.createElement('i');
        const label = document.createElement('b');
        label.textContent = type === 'region'
          ? REGION_LABELS[locationId] ?? feature.properties?.name_ru ?? locationId
          : (feature.properties?.name_ru ?? locationId).replace(/\s+район$/iu, '');
        element.style.setProperty('--area-color', type === 'region'
          ? REGION_COLORS[locationId] ?? DEFAULT_AREA_COLOR
          : areaColorForParent(feature.properties?.parent_id));
        element.append(dot, label);
        const labelPosition = representativePoint(feature.geometry);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (location) handleLocationInteraction(location, labelPosition);
        });
        new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat(labelPosition)
          .addTo(map);
        const rings = feature.geometry.type === 'Polygon'
          ? feature.geometry.coordinates
          : feature.geometry.coordinates.flat();
        const priority = Math.max(...rings.map((ring) => Math.abs(ringArea(ring))));
        administrativeLabelRegistryRef.current.push({ element, type, priority, locationId });
      });

      pointLocations.forEach((location) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `location-marker city-marker${location.id === 'city-dushanbe' ? ' capital' : ''}`;
        element.setAttribute('aria-label', `${location.name_ru}, ${location.name_tg}`);
        element.title = `${location.name_ru} · ${location.name_tg}`;
        element.style.setProperty('--marker-color', locationMarkerColor(location));

        const dot = document.createElement('span');
        dot.className = 'marker-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'marker-label';
        label.textContent = location.name_ru;
        label.setAttribute('aria-hidden', 'true');
        element.append(dot, label);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (isLocationSelected(location)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            handleLocationInteraction(location, [location.longitude, location.latitude]);
            return;
          }
          // Let MapLibre open the marker popup first; focusLocation sees it
          // already open and does not toggle it closed again.
          queueMicrotask(() => handleLocationInteraction(
            location,
            [location.longitude, location.latitude],
          ));
        });

        const popup = new maplibregl.Popup({
          anchor: 'bottom',
          offset: 16,
          closeButton: true,
          maxWidth: 'min(280px, calc(100vw - 24px))',
          className: 'place-map-popup',
        })
          .setDOMContent(createPopupContent(location, (selection) => onPlaceResearchRef.current?.(selection)));
        popup.on('open', () => activatePopup(popup));
        popup.on('close', () => clearPopupReference(popup));
        const marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([location.longitude, location.latitude])
          .setPopup(popup)
          .addTo(map);
        markerRegistryRef.current.set(location.id, { marker, location });
      });

      syncMarkerVisibility();
      syncAdministrativeLabelVisibility();
      syncBoundarySelection();
      const pendingLocationId = pendingFocusRef.current;
      if (pendingLocationId) {
        const pendingLocation = pointLocations.find((location) => location.id === pendingLocationId);
        pendingFocusRef.current = null;
        if (pendingLocation) focusLocation(pendingLocation);
      }
    });

    return () => {
      map.off('zoom', handleZoom);
      map.off('moveend', syncAdministrativeLabelVisibility);
      if (administrativeLabelFrameRef.current !== null) {
        cancelAnimationFrame(administrativeLabelFrameRef.current);
        administrativeLabelFrameRef.current = null;
      }
      closeActivePopup();
      markerRegistryRef.current.clear();
      administrativeLabelRegistryRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const handleRegionChange = (regionId: string) => {
    if (regionId === 'all') {
      clearLocationSelection();
      return;
    }
    closeActivePopup();
    viewStateRef.current.selectedLocationId = null;
    setSelectedLocationId(null);
    setSelectedRegionId(regionId);
    setSelectedDistrictId('all');
    const region = locationById.get(regionId);
    if (region) focusAdministrativeLocation(region);
    onGeographyFilterChange?.({ regionId, districtId: 'all' });
  };

  const handleDistrictChange = (districtId: string) => {
    closeActivePopup();
    viewStateRef.current.selectedLocationId = null;
    setSelectedLocationId(null);
    setSelectedDistrictId(districtId);
    const district = locationById.get(districtId);
    if (district) focusAdministrativeLocation(district);
    onGeographyFilterChange?.({ regionId: selectedRegionId, districtId });
  };

  return (
    <div class="map-shell">
      <div ref={ref} class="map-canvas" role="application" tabIndex={0} aria-label="Интерактивная карта Таджикистана" />
      <LocationLayerControls
        cityCount={cities.length}
        showCities={showCities}
        query={query}
        searchResults={searchResults}
        selectedLocationId={selectedLocationId}
        regions={regions}
        districts={districts}
        selectedRegionId={selectedRegionId}
        selectedDistrictId={selectedDistrictId}
        getParentLabel={getParentLabel}
        onToggleCities={setShowCities}
        onQueryChange={setQuery}
        onRegionChange={handleRegionChange}
        onDistrictChange={handleDistrictChange}
        onSelectLocation={focusLocation}
        onClearSearch={() => setQuery('')}
      />
    </div>
  );
}
