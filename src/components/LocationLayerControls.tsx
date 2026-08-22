import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanonicalLocation } from '../data/cities';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  CloseIcon,
} from './icons';

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

type SelectOption = {
  value: string;
  label: string;
  group?: string;
};

interface AppleSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

function AppleSelect({
  label,
  value,
  options,
  onChange,
}: AppleSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent | PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];
  const hasGroups = useMemo(() => options.some((opt) => opt.group), [options]);

  return (
    <div class={`apple-select-wrapper${isOpen ? ' is-open' : ''}`} ref={containerRef}>
      <span class="apple-select-label">{label}</span>
      <button
        type="button"
        class={`apple-select-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span class="apple-select-value">{selectedOption?.label || label}</span>
        <ChevronDownIcon size={12} class="apple-select-chevron" />
      </button>

      {isOpen && (
        <div class="apple-select-dropdown" role="listbox">
          {hasGroups ? (
            (() => {
              const groupsMap = new Map<string, SelectOption[]>();
              const ungrouped: SelectOption[] = [];

              options.forEach((opt) => {
                if (opt.group) {
                  const list = groupsMap.get(opt.group) || [];
                  list.push(opt);
                  groupsMap.set(opt.group, list);
                } else {
                  ungrouped.push(opt);
                }
              });

              return (
                <>
                  {ungrouped.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      role="option"
                      aria-selected={opt.value === value}
                      class={`apple-select-option${opt.value === value ? ' is-selected' : ''}`}
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                    >
                      <span class="apple-select-option-text">{opt.label}</span>
                      {opt.value === value && <CheckIcon size={13} class="apple-select-check" />}
                    </button>
                  ))}
                  {Array.from(groupsMap.entries()).map(([groupName, groupOptions]) => (
                    <div class="apple-select-group" key={groupName}>
                      <div class="apple-select-group-header">{groupName}</div>
                      {groupOptions.map((opt) => (
                        <button
                          type="button"
                          key={opt.value}
                          role="option"
                          aria-selected={opt.value === value}
                          class={`apple-select-option${opt.value === value ? ' is-selected' : ''}`}
                          onClick={() => {
                            onChange(opt.value);
                            setIsOpen(false);
                          }}
                        >
                          <span class="apple-select-option-text">{opt.label}</span>
                          {opt.value === value && <CheckIcon size={13} class="apple-select-check" />}
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              );
            })()
          ) : (
            options.map((opt) => (
              <button
                type="button"
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                class={`apple-select-option${opt.value === value ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                <span class="apple-select-option-text">{opt.label}</span>
                {opt.value === value && <CheckIcon size={13} class="apple-select-check" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
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

  const regionOptions: SelectOption[] = useMemo(() => [
    { value: 'all', label: 'Все регионы / Ҳама вилоятҳо' },
    ...regions.map((region) => ({
      value: region.id,
      label: optionLabel(region),
    })),
  ], [regions]);

  const districtOptions: SelectOption[] = useMemo(() => [
    { value: 'all', label: 'Все районы / Ҳама ноҳияҳо' },
    ...(selectedRegionId === 'all'
      ? regions.flatMap((region) => {
          const regionDistricts = districts.filter((district) => district.parent_id === region.id);
          return regionDistricts.map((district) => ({
            value: district.id,
            label: optionLabel(district),
            group: optionLabel(region),
          }));
        })
      : districtsForSelectedRegion.map((district) => ({
          value: district.id,
          label: optionLabel(district),
        }))
    ),
  ], [regions, districts, selectedRegionId, districtsForSelectedRegion]);

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
        {isExpanded ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
      </button>
      <aside
        id="location-controls-panel"
        class="location-controls"
        aria-label="Слои и поиск по населённым пунктам"
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
      <div class="location-controls-header">
        <div class="location-controls-title-wrap">
          <span>НАСЕЛЁННЫЕ ПУНКТЫ</span>
          <strong class="location-controls-count">{cityCount}</strong>
        </div>
        <button
          type="button"
          class="location-controls-close-btn"
          onClick={() => setIsExpanded(false)}
          title="Скрыть панель"
          aria-label="Закрыть панель населённых пунктов"
        >
          <CloseIcon size={14} />
        </button>
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
          placeholder="Душанбе / Худжанд"
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
        <AppleSelect
          label="Регион / Вилоят"
          value={selectedRegionId}
          options={regionOptions}
          onChange={onRegionChange}
        />
        <AppleSelect
          label="Район / Ноҳия"
          value={selectedDistrictId}
          options={districtOptions}
          onChange={onDistrictChange}
        />
        {/* <p class="location-filter-note">Выбранная территория подсвечивается по границам OpenStreetMap.</p> */}
      </div>

      <p class="location-proof-note">На карте показаны области, официальные районы и города. Малые посёлки скрыты.</p>
      </aside>
    </div>
  );
}
