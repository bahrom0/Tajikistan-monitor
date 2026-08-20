import { useState } from 'preact/hooks';
import type { CanonicalLocation } from '../data/cities';

export type LocationPoint = CanonicalLocation & {
  longitude: number;
  latitude: number;
};

interface LocationLayerControlsProps {
  cityCount: number;
  showCities: boolean;
  query: string;
  searchResults: LocationPoint[];
  selectedLocationId: string | null;
  regions: CanonicalLocation[];
  districts: CanonicalLocation[];
  selectedRegionId: string;
  selectedDistrictId: string;
  getParentLabel: (location: LocationPoint) => string;
  onToggleCities: (visible: boolean) => void;
  onQueryChange: (query: string) => void;
  onRegionChange: (regionId: string) => void;
  onDistrictChange: (districtId: string) => void;
  onSelectLocation: (location: LocationPoint) => void;
  onClearSearch: () => void;
}

const locationTypeLabel = () => 'Город / Шаҳр';

const optionLabel = (location: CanonicalLocation) => `${location.name_ru} · ${location.name_tg}`;

export function LocationLayerControls({
  cityCount,
  showCities,
  query,
  searchResults,
  selectedLocationId,
  regions,
  districts,
  selectedRegionId,
  selectedDistrictId,
  getParentLabel,
  onToggleCities,
  onQueryChange,
  onRegionChange,
  onDistrictChange,
  onSelectLocation,
  onClearSearch,
}: LocationLayerControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasQuery = query.trim().length > 0;
  const districtsForSelectedRegion = selectedRegionId === 'all'
    ? districts
    : districts.filter((district) => district.parent_id === selectedRegionId);

  return (
    <div class={`location-controls-shell${isExpanded ? '' : ' is-collapsed'}`}>
      <button
        type="button"
        class="location-controls-toggle"
        aria-expanded={isExpanded}
        aria-controls="location-controls-panel"
        aria-label={isExpanded ? 'Скрыть панель населённых пунктов' : 'Показать панель населённых пунктов'}
        title={isExpanded ? 'Скрыть панель' : 'Показать панель'}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span aria-hidden="true">{isExpanded ? '›' : '‹'}</span>
      </button>
      <aside
        id="location-controls-panel"
        class="location-controls"
        aria-label="Слои и поиск по населённым пунктам"
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
      <div class="location-controls-header">
        <span>НАСЕЛЁННЫЕ ПУНКТЫ</span>
        <strong>{cityCount}</strong>
      </div>

      <div class="location-layer-switches" role="group" aria-label="Переключатели слоёв карты">
        <button
          type="button"
          class={`location-layer-toggle city-layer${showCities ? ' is-active' : ''}`}
          aria-pressed={showCities}
          onClick={() => onToggleCities(!showCities)}
        >
          <span class="location-layer-swatch city-swatch" aria-hidden="true" />
          <span>Города</span>
          <strong>{cityCount}</strong>
        </button>
      </div>

      <label class="location-search">
        <span>Поиск мест</span>
        <input
          type="search"
          value={query}
          onInput={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Душанбе / Душанбе"
          aria-label="Поиск по русскому и таджикскому названию"
          aria-controls="location-search-results"
          aria-expanded={hasQuery}
        />
      </label>

      {hasQuery ? (
        <div
          class="location-search-results"
          id="location-search-results"
          role="listbox"
          aria-label="Результаты поиска мест"
        >
          {searchResults.length ? searchResults.map((location) => (
            <button
              type="button"
              role="option"
              aria-selected={selectedLocationId === location.id}
              aria-label={`Выбрать ${location.name_ru}, ${location.name_tg}`}
              class={`location-result${selectedLocationId === location.id ? ' is-selected' : ''}`}
              key={location.id}
              onClick={() => onSelectLocation(location)}
            >
              <span class="location-result-name">
                <strong>{location.name_ru}</strong>
                <span>{location.name_tg}</span>
              </span>
              <small>{locationTypeLabel()} · {getParentLabel(location)}</small>
            </button>
          )) : (
            <div class="location-search-empty" role="status" aria-live="polite">
              <span>Ничего не найдено по русскому или таджикскому названию.</span>
              <button type="button" onClick={onClearSearch}>Очистить поиск</button>
            </div>
          )}
        </div>
      ) : (
        <p class="location-search-hint">Ищите по русскому или таджикскому названию.</p>
      )}

      <div class="location-filter-grid">
        <div class="location-filter-title">ИЕРАРХИЯ: РЕГИОН → РАЙОН</div>
        <label class="location-filter">
          <span>Регион / Вилоят</span>
          <select value={selectedRegionId} onChange={(event) => onRegionChange(event.currentTarget.value)}>
            <option value="all">Все регионы / Ҳама вилоятҳо</option>
            {regions.map((region) => <option value={region.id} key={region.id}>{optionLabel(region)}</option>)}
          </select>
        </label>
        <label class="location-filter">
          <span>Район / Ноҳия</span>
          <select value={selectedDistrictId} onChange={(event) => onDistrictChange(event.currentTarget.value)}>
            <option value="all">Все районы / Ҳама ноҳияҳо</option>
            {selectedRegionId === 'all' ? regions.map((region) => {
              const regionDistricts = districts.filter((district) => district.parent_id === region.id);
              return regionDistricts.length ? (
                <optgroup label={optionLabel(region)} key={region.id}>
                  {regionDistricts.map((district) => <option value={district.id} key={district.id}>{optionLabel(district)}</option>)}
                </optgroup>
              ) : null;
            }) : districtsForSelectedRegion.map((district) => (
              <option value={district.id} key={district.id}>{optionLabel(district)}</option>
            ))}
          </select>
        </label>
        <p class="location-filter-note">Выбранная территория подсвечивается по границам OpenStreetMap.</p>
      </div>

      <p class="location-proof-note">На карте показаны области, официальные районы и города. Малые посёлки скрыты.</p>
      </aside>
    </div>
  );
}
