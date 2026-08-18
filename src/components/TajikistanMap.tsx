import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cities, locations, type CanonicalLocation } from '../data/cities';
import {
  LocationLayerControls,
  TOWN_VISIBILITY_ZOOM,
  type LocationPoint,
} from './LocationLayerControls';
import administrativeBoundaries from '../data/geography/administrative-boundaries.json';
import type { NewsItem } from '../types';

type Position = [number, number];
type AdministrativeGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };
type AdministrativeFeature = {
  properties?: { location_type?: string };
  geometry: AdministrativeGeometry;
};

const buildCountryOutline = () => {
  const edges = new Map<string, { count: number; coordinates: [Position, Position] }>();
  const features = (administrativeBoundaries.features as unknown as AdministrativeFeature[])
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

type MapViewState = {
  showCities: boolean;
  showTowns: boolean;
  regionId: string;
  districtId: string;
  selectedLocationId: string | null;
};

const isTownPoint = (location: CanonicalLocation): location is LocationPoint => (
  location.type === 'town' && location.longitude !== null && location.latitude !== null
);

const towns = locations.filter(isTownPoint);
const regions = locations.filter((location) => location.type === 'region');
const districts = locations.filter((location) => location.type === 'district');
const pointLocations: LocationPoint[] = [...cities, ...towns];
const locationById = new Map<string, CanonicalLocation>(locations.map((location) => [location.id, location]));
const CITY_LABEL_VISIBILITY_ZOOM = 6.4;
const TOWN_LABEL_VISIBILITY_ZOOM = TOWN_VISIBILITY_ZOOM + 0.9;

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
  const mapZoomRef = useRef(5.15);
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
  const [showTowns, setShowTowns] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState('all');
  const [selectedDistrictId, setSelectedDistrictId] = useState('all');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const viewStateRef = useRef<MapViewState>({
    showCities: true,
    showTowns: true,
    regionId: 'all',
    districtId: 'all',
    selectedLocationId: null,
  });
  viewStateRef.current = {
    showCities,
    showTowns,
    regionId: selectedRegionId,
    districtId: selectedDistrictId,
    selectedLocationId,
  };

  const syncMarkerVisibility = () => {
    const state = viewStateRef.current;
    markerRegistryRef.current.forEach(({ marker, location }) => {
      const element = marker.getElement();
      const layerVisible = location.type === 'city' ? state.showCities : state.showTowns;
      const zoomVisible = location.type === 'city' || mapZoomRef.current >= TOWN_VISIBILITY_ZOOM;
      const visible = layerVisible && zoomVisible && isInHierarchy(location, state.regionId, state.districtId);
      const labelVisibilityZoom = location.type === 'city'
        ? CITY_LABEL_VISIBILITY_ZOOM
        : TOWN_LABEL_VISIBILITY_ZOOM;
      const showLabel = mapZoomRef.current >= labelVisibilityZoom;

      element.style.display = visible ? '' : 'none';
      element.tabIndex = visible ? 0 : -1;
      element.setAttribute('aria-hidden', String(!visible));
      element.classList.toggle('label-visible', showLabel);
      element.classList.toggle('is-selected', state.selectedLocationId === location.id);
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
  };

  const focusLocation = (location: LocationPoint, openPopup = true) => {
    const state = viewStateRef.current;
    if (location.type === 'city') {
      state.showCities = true;
      setShowCities(true);
    } else {
      state.showTowns = true;
      setShowTowns(true);
    }
    state.selectedLocationId = location.id;
    setSelectedLocationId(location.id);

    const map = mapRef.current;
    if (!map) {
      pendingFocusRef.current = location.id;
      return;
    }

    const minimumZoom = location.type === 'town' ? TOWN_VISIBILITY_ZOOM + 0.9 : 6.8;
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
    syncBoundarySelection();
  }, [showCities, showTowns, selectedRegionId, selectedDistrictId, selectedLocationId]);

  useEffect(() => {
    const source = mapRef.current?.getSource('news-locations') as maplibregl.GeoJSONSource | undefined;
    source?.setData(newsDataRef.current);
  }, [news]);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      center: [70.72, 38.55],
      zoom: 5.15,
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
    };
    map.on('zoom', handleZoom);

    map.on('load', () => {
      map.addSource('administrative', { type: 'geojson', data: administrativeBoundaries as maplibregl.GeoJSONSourceSpecification['data'] });
      map.addSource('country-outline', { type: 'geojson', data: administrativeCountryOutline });
      map.addLayer({ id: 'country-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'region'], paint: { 'fill-color': '#0f2923', 'fill-opacity': 0.72 } });
      map.addLayer({ id: 'country-glow', type: 'line', source: 'country-outline', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#35f2ac', 'line-width': ['interpolate', ['linear'], ['zoom'], 4.5, 9, 11, 14], 'line-opacity': 0.13, 'line-blur': 7 } });
      map.addLayer({ id: 'regions-hit', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'region'], paint: { 'fill-color': '#35e6a4', 'fill-opacity': 0.01 } });
      map.addLayer({ id: 'districts-hit', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_type'], 'district'], minzoom: 6, paint: { 'fill-color': '#f0c067', 'fill-opacity': 0.01 } });
      map.addLayer({ id: 'regions-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_type'], 'region'], paint: { 'line-color': '#54cfa4', 'line-width': 1.25, 'line-opacity': 0.58 } });
      map.addLayer({ id: 'districts-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_type'], 'district'], minzoom: 5.5, paint: { 'line-color': '#7cae9d', 'line-width': 0.7, 'line-opacity': 0.34, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'selected-region-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'fill-color': '#35e6a4', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'selected-region-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'line-color': '#7effc9', 'line-width': 3, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'selected-district-fill', type: 'fill', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'fill-color': '#f0c067', 'fill-opacity': 0.2 } });
      map.addLayer({ id: 'selected-district-line', type: 'line', source: 'administrative', filter: ['==', ['get', 'location_id'], '__none__'], paint: { 'line-color': '#f0c067', 'line-width': 2.5, 'line-opacity': 1 } });
      map.addLayer({ id: 'country-line', type: 'line', source: 'country-outline', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#41e7aa', 'line-width': ['interpolate', ['linear'], ['zoom'], 4.5, 2.5, 8, 3.5, 11, 4.5], 'line-opacity': 0.94, 'line-blur': 0.2 } });

      map.addSource('news-locations', { type: 'geojson', data: newsDataRef.current });
      map.addLayer({ id: 'news-location-points', type: 'circle', source: 'news-locations', paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'article_count'], 1, 7, 5, 11, 10, 15], 'circle-color': ['case', ['==', ['get', 'severity'], 'alert'], '#ff765e', '#f0c067'],
        'circle-stroke-color': '#06100e', 'circle-stroke-width': 2, 'circle-opacity': 0.95,
      } });
      map.on('click', (event) => {
        if (map.queryRenderedFeatures(event.point, { layers: ['news-location-points'] }).length) return;
        const hitLayers = map.getZoom() >= 6 ? ['districts-hit', 'regions-hit'] : ['regions-hit'];
        const feature = map.queryRenderedFeatures(event.point, { layers: hitLayers })[0];
        const locationId = String(feature?.properties?.location_id || '');
        const location = locationById.get(locationId);
        if (!location || (location.type !== 'region' && location.type !== 'district')) return;
        if (location.type === 'region') {
          viewStateRef.current.regionId = location.id;
          viewStateRef.current.districtId = 'all';
          setSelectedRegionId(location.id);
          setSelectedDistrictId('all');
          onGeographyFilterChange?.({ regionId: location.id, districtId: 'all' });
        } else {
          const regionId = location.parent_id || 'all';
          viewStateRef.current.regionId = regionId;
          viewStateRef.current.districtId = location.id;
          setSelectedRegionId(regionId);
          setSelectedDistrictId(location.id);
          onGeographyFilterChange?.({ regionId, districtId: location.id });
        }
        syncBoundarySelection();
        new maplibregl.Popup({ maxWidth: 'min(300px, calc(100vw - 24px))', className: 'place-map-popup' })
          .setLngLat(event.lngLat)
          .setDOMContent(createPopupContent(location, (selection) => onPlaceResearchRef.current?.(selection)))
          .addTo(map);
      });
      map.on('mouseenter', 'regions-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'regions-hit', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'districts-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'districts-hit', () => { map.getCanvas().style.cursor = ''; });
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
        new maplibregl.Popup({
          anchor: 'top',
          offset: 12,
          maxWidth: 'min(320px, calc(100vw - 24px))',
          className: 'news-map-popup',
        }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on('mouseenter', 'news-location-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'news-location-points', () => { map.getCanvas().style.cursor = ''; });

      pointLocations.forEach((location) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `location-marker ${location.type === 'city' ? 'city-marker' : 'town-marker'}${location.id === 'city-dushanbe' ? ' capital' : ''}`;
        element.setAttribute('aria-label', `${location.name_ru}, ${location.name_tg}`);
        element.title = `${location.name_ru} · ${location.name_tg}`;

        const dot = document.createElement('span');
        dot.className = 'marker-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'marker-label';
        label.textContent = location.name_ru;
        label.setAttribute('aria-hidden', 'true');
        element.append(dot, label);
        element.addEventListener('click', () => focusLocation(location, false));

        const popup = new maplibregl.Popup({
          anchor: 'bottom',
          offset: 16,
          closeButton: true,
          maxWidth: 'min(280px, calc(100vw - 24px))',
          className: 'place-map-popup',
        })
          .setDOMContent(createPopupContent(location, (selection) => onPlaceResearchRef.current?.(selection)));
        const marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([location.longitude, location.latitude])
          .setPopup(popup)
          .addTo(map);
        markerRegistryRef.current.set(location.id, { marker, location });
      });

      syncMarkerVisibility();
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
      markerRegistryRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const handleRegionChange = (regionId: string) => {
    setSelectedRegionId(regionId);
    setSelectedDistrictId('all');
    onGeographyFilterChange?.({ regionId, districtId: 'all' });
  };

  const handleDistrictChange = (districtId: string) => {
    setSelectedDistrictId(districtId);
    onGeographyFilterChange?.({ regionId: selectedRegionId, districtId });
  };

  return (
    <div class="map-shell">
      <div ref={ref} class="map-canvas" role="application" tabIndex={0} aria-label="Интерактивная карта Таджикистана" />
      <LocationLayerControls
        cityCount={cities.length}
        townCount={towns.length}
        showCities={showCities}
        showTowns={showTowns}
        query={query}
        searchResults={searchResults}
        selectedLocationId={selectedLocationId}
        regions={regions}
        districts={districts}
        selectedRegionId={selectedRegionId}
        selectedDistrictId={selectedDistrictId}
        townVisibilityZoom={TOWN_VISIBILITY_ZOOM}
        getParentLabel={getParentLabel}
        onToggleCities={setShowCities}
        onToggleTowns={setShowTowns}
        onQueryChange={setQuery}
        onRegionChange={handleRegionChange}
        onDistrictChange={handleDistrictChange}
        onSelectLocation={focusLocation}
        onClearSearch={() => setQuery('')}
      />
    </div>
  );
}
