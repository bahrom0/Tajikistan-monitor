import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ExternalLinkIcon,
  LayersIcon,
  LightbulbIcon,
  MapPinIcon,
  MoonIcon,
  NewspaperIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
  TrendingUpIcon,
} from './icons';
import {
  demoNews,
  demoNewsCategories,
  demoNewsImportanceOptions,
  demoNewsRegions,
  type DemoNewsImportance,
  type DemoNewsItem,
} from '../data/news-demo';

type NewsPageProps = {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onNavigateMap: () => void;
};

type NewsTab = 'Главное' | 'Последние' | 'Для меня';

const importanceMeta: Record<DemoNewsImportance, { label: string; className: string }> = {
  critical: { label: 'Срочно', className: 'is-critical' },
  high: { label: 'Высокая', className: 'is-high' },
  medium: { label: 'Средняя', className: 'is-medium' },
  low: { label: 'Низкая', className: 'is-low' },
};

const importanceScore: Record<DemoNewsImportance, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const quickNow = [
  { icon: <LightbulbIcon size={21} />, title: 'Свет', value: '3 района', detail: 'Отключения', meta: '1 ч назад', tone: 'blue' },
  { icon: <SunIcon size={21} />, title: 'Погода', value: '+24°', detail: 'Ясно', meta: '30 мин назад', tone: 'amber' },
  { icon: <TrendingUpIcon size={21} />, title: 'Курс валют', value: '10.92', detail: 'USD / TJS', meta: '−0.03', tone: 'indigo' },
  { icon: <AlertTriangleIcon size={21} />, title: 'Дорога', value: 'А-376', detail: 'Перекрыт участок', meta: '2 ч назад', tone: 'red' },
  { icon: <MapPinIcon size={21} />, title: 'Вода', value: 'Чилучор', detail: 'Ограничение', meta: '3 ч назад', tone: 'blue' },
];

const tabLabels: NewsTab[] = ['Главное', 'Последние', 'Для меня'];

const formatRelative = (value: string) => {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн. назад`;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Dushanbe',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const getNewsIdFromPath = () => {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/news\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const NewsImage = ({ item, className = '' }: { item: DemoNewsItem; className?: string }) => (
  <img
    class={className}
    src={item.imageUrl}
    alt={item.imageAlt}
    loading="lazy"
    onError={(event) => {
      const image = event.currentTarget as HTMLImageElement;
      if (image.dataset.fallback) return;
      image.dataset.fallback = 'true';
      image.src = '/news-demo-khujand.jpg';
    }}
  />
);

const SourceLine = ({ item, compact = false }: { item: DemoNewsItem; compact?: boolean }) => (
  <div class={`news-source-line${compact ? ' is-compact' : ''}`}>
    <span class="news-source-name">{item.source}</span>
    <span class="news-source-separator">•</span>
    <span>{item.sourceKind === 'official' ? 'Официальный' : 'СМИ'}</span>
  </div>
);

const ImportanceBadge = ({ item, compact = false }: { item: DemoNewsItem; compact?: boolean }) => (
  <span class={`news-importance ${importanceMeta[item.importance].className}${compact ? ' is-compact' : ''}`}>
    {importanceMeta[item.importance].label}
  </span>
);

type NewsFilterKey = 'category' | 'region' | 'city' | 'importance';

type NewsDropdownProps = {
  filterKey: NewsFilterKey;
  label: string;
  value: string;
  displayValue: string;
  options: string[];
  openFilter: NewsFilterKey | null;
  onToggle: (filterKey: NewsFilterKey) => void;
  onSelect: (value: string) => void;
};

function NewsDropdown({ filterKey, label, value, displayValue, options, openFilter, onToggle, onSelect }: NewsDropdownProps) {
  const isOpen = openFilter === filterKey;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (wasOpenRef.current && !isOpen && openFilter === null) {
      optionRefs.current = [];
      triggerRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, openFilter]);

  const handleTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const nextIndex = event.key === 'ArrowUp' ? options.length - 1 : 0;
    if (!isOpen) onToggle(filterKey);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  };

  const handleOptionKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div class="news-filter-control news-dropdown">
      <button
        type="button"
        class="news-dropdown-trigger"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => onToggle(filterKey)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{displayValue}</span>
        <ChevronDownIcon size={14} />
      </button>
      {isOpen && (
        <div class="news-filter-popover" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              class={option === value ? 'is-selected' : ''}
              key={option}
              ref={(element) => { optionRefs.current[index] = element; }}
              onClick={() => onSelect(option)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span>{option}</span>
              {option === value && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type NewsArticleViewProps = {
  item: DemoNewsItem | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onBack: () => void;
  onOpenRelated: (item: DemoNewsItem) => void;
  saved: boolean;
  onToggleSaved: () => void;
};

function NewsArticleView({ item, theme, onToggleTheme, onBack, onOpenRelated, saved, onToggleSaved }: NewsArticleViewProps) {
  const [aiExpanded, setAiExpanded] = useState(true);
  const related = item
    ? demoNews.filter((candidate) => candidate.id !== item.id && (candidate.category === item.category || candidate.region === item.region)).slice(0, 3)
    : [];

  return (
    <section class="news-route news-detail-route" aria-label={item ? `Новость: ${item.title}` : 'Новость не найдена'}>
      <div class="news-detail-page">
        <header class="news-detail-header">
          <button type="button" class="news-detail-back" onClick={onBack}>
            <ChevronLeftIcon size={18} />
            <span>Назад к новостям</span>
          </button>
          <div class="news-detail-brand" aria-label="Tajikistan Monitor">
            <span>Tajikistan</span>
            <span>Monitor</span>
          </div>
          <button
            type="button"
            class="news-theme-toggle"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          >
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>
        </header>

        {!item ? (
          <main class="news-detail-not-found">
            <NewspaperIcon size={32} />
            <h1>Новость не найдена</h1>
            <p>Материал мог быть удалён или ссылка содержит неверный идентификатор.</p>
            <button type="button" class="news-outline-button" onClick={onBack}>Открыть ленту</button>
          </main>
        ) : (
          <main class="news-detail-layout">
            <article class="news-detail-article">
              <div class="news-detail-source-row">
                <SourceLine item={item} />
                <ImportanceBadge item={item} />
                {item.recommended && <span class="news-detail-recommended"><SparklesIcon size={13} />Рекомендуем</span>}
              </div>
              <div class="news-detail-dates">
                <span><BookOpenIcon size={15} />Опубликовано: {formatDateTime(item.publishedAt)}</span>
                <span><TrendingUpIcon size={15} />Обновлено: {formatDateTime(item.updatedAt)}</span>
              </div>
              <h1 id="news-detail-title">{item.title}</h1>
              <p class="news-detail-lead">{item.summary}</p>
              <div class="news-detail-tags">
                <span><MapPinIcon size={14} />{item.region} / {item.city}</span>
                <span><LayersIcon size={14} />{item.category}</span>
              </div>
              <figure class="news-detail-cover">
                <NewsImage item={item} className="news-detail-image" />
                <figcaption>{item.demo ? 'Демонстрационный материал' : 'Изображение источника'}</figcaption>
              </figure>
              <div class={`news-detail-importance ${importanceMeta[item.importance].className}`}>
                <ShieldCheckIcon size={18} />
                <span>
                  <strong>{item.isUrgent ? 'Срочное официальное сообщение' : `${importanceMeta[item.importance].label} важность`}</strong>
                  <small>{item.isUrgent ? 'Следите за обновлениями служб' : 'Уровень рассчитан по источнику, теме и охвату'}</small>
                </span>
              </div>
              <section class={`news-ai-summary${aiExpanded ? ' is-open' : ''}`}>
                <button type="button" class="news-ai-summary-head" onClick={() => setAiExpanded((value) => !value)} aria-expanded={aiExpanded}>
                  <span class="news-ai-icon"><SparklesIcon size={21} /></span>
                  <span><strong>AI-кратко</strong><small>Понятное объяснение без сложных вопросов</small></span>
                  <ChevronDownIcon size={18} />
                </button>
                {aiExpanded && (
                  <div class="news-ai-summary-content">
                    <p>{item.aiSummary}</p>
                    <h3>Что важно знать</h3>
                    <ul>{item.aiFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                    <small class="news-ai-disclaimer">ИИ-пересказ для удобного чтения. Сверяйте детали с первоисточником.</small>
                  </div>
                )}
              </section>
              <section class="news-why-card">
                <span class="news-why-icon"><LightbulbIcon size={19} /></span>
                <span><strong>Почему показано</strong><small>{item.recommendationReason}</small></span>
                <CheckIcon size={17} />
              </section>
              <div class="news-detail-article-copy">
                <h2>Подробности</h2>
                {item.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
              <div class="news-detail-source-links">
                <h2>Источники и ссылки</h2>
                <a href={item.originalUrl} target="_blank" rel="noreferrer" class="news-original-link">
                  <ExternalLinkIcon size={15} />
                  <span>Открыть первоисточник: {item.source}</span>
                </a>
                <small>Ссылка ведёт на внешний сайт источника. Demo-материал не является официальной публикацией.</small>
              </div>
              <div class="news-detail-actions">
                <button type="button" class={`news-detail-save${saved ? ' is-saved' : ''}`} onClick={onToggleSaved} aria-pressed={saved}>
                  {saved ? 'Сохранено' : 'Сохранить'}
                </button>
              </div>
            </article>

            <aside class="news-detail-sidebar" aria-label="Контекст новости">
              <section class="news-detail-side-card">
                <span class="news-detail-side-eyebrow">В двух словах</span>
                <strong>{item.city}, {item.region}</strong>
                <span>{item.category} · {importanceMeta[item.importance].label}</span>
              </section>
              <section class="news-detail-side-card">
                <h2>Связанные ссылки</h2>
                <a href={item.originalUrl} target="_blank" rel="noreferrer"><ExternalLinkIcon size={14} />Первоисточник</a>
                {item.tags.map((tag) => <span class="news-detail-side-tag" key={tag}>#{tag}</span>)}
              </section>
              {related.length > 0 && (
                <section class="news-detail-side-card">
                  <h2>По теме</h2>
                  {related.map((relatedItem) => (
                    <button type="button" class="news-detail-related-link" key={relatedItem.id} onClick={() => onOpenRelated(relatedItem)}>
                      <span>{relatedItem.title}</span>
                      <ChevronRightIcon size={15} />
                    </button>
                  ))}
                </section>
              )}
            </aside>
          </main>
        )}
      </div>
    </section>
  );
}

export function NewsPage({ theme, onToggleTheme, onNavigateMap }: NewsPageProps) {
  const [activeTab, setActiveTab] = useState<NewsTab>('Главное');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [region, setRegion] = useState('Все регионы');
  const [city, setCity] = useState('Все города');
  const [importance, setImportance] = useState<DemoNewsImportance | 'all'>('all');
  const [officialOnly, setOfficialOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<NewsFilterKey | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => getNewsIdFromPath());
  const newsViewportRef = useRef<HTMLDivElement>(null);
  const feedScrollTopRef = useRef(0);

  const selected = selectedId ? demoNews.find((item) => item.id === selectedId) ?? null : null;

  useEffect(() => {
    const handlePopState = () => setSelectedId(getNewsIdFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenFilter(null);
        setMoreOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (selectedId) {
      document.querySelector<HTMLElement>('.news-detail-route')?.scrollTo(0, 0);
      return;
    }
    requestAnimationFrame(() => {
      const viewport = newsViewportRef.current;
      if (!viewport) return;
      const previousBehavior = viewport.style.scrollBehavior;
      viewport.style.scrollBehavior = 'auto';
      viewport.scrollTop = feedScrollTopRef.current;
      viewport.style.scrollBehavior = previousBehavior;
    });
  }, [selectedId]);

  const openArticle = (item: DemoNewsItem) => {
    feedScrollTopRef.current = newsViewportRef.current?.scrollTop ?? 0;
    setSelectedId(item.id);
    window.history.pushState(null, '', `/news/${encodeURIComponent(item.id)}`);
  };

  const closeArticle = () => {
    setSelectedId(null);
    if (window.location.pathname.startsWith('/news/')) window.history.replaceState(null, '', '/news');
  };

  const toggleSaved = (item: DemoNewsItem) => {
    setSavedIds((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]));
  };

  const filteredNews = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
    return demoNews
      .filter((item) => {
        const matchesTab = activeTab === 'Последние' || activeTab === 'Главное' ? true : item.recommended;
        const matchesQuery = !normalizedQuery || [item.title, item.summary, item.source, item.city, item.region, item.category].some((value) => value.toLocaleLowerCase('ru-RU').includes(normalizedQuery));
        const matchesCategory = category === 'Все' || item.category === category;
        const matchesRegion = region === 'Все регионы' || item.region === region;
        const matchesCity = city === 'Все города' || item.city === city;
        const matchesImportance = importance === 'all' || item.importance === importance;
        const matchesSource = !officialOnly || item.sourceKind === 'official';
        return matchesTab && matchesQuery && matchesCategory && matchesRegion && matchesCity && matchesImportance && matchesSource;
      })
      .sort((left, right) => {
        if (activeTab === 'Последние') return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
        if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
        if (importanceScore[left.importance] !== importanceScore[right.importance]) return importanceScore[right.importance] - importanceScore[left.importance];
        return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
      });
  }, [activeTab, category, city, importance, officialOnly, query, region]);

  const cityOptions = useMemo(() => ['Все города', ...new Set(demoNews.map((item) => item.city))], []);

  const hero = filteredNews[0] ?? demoNews[0];
  const secondary = filteredNews.slice(1, 3);
  const headlineIds = new Set([hero.id, ...secondary.map((item) => item.id)]);
  const feed = filteredNews.filter((item) => !headlineIds.has(item.id)).slice(0, 6);
  const missNews = demoNews.filter((item) => !headlineIds.has(item.id)).slice(0, 5);
  const selectionCount = filteredNews.length;

  const resetFilters = () => {
    setQuery('');
    setCategory('Все');
    setRegion('Все регионы');
    setCity('Все города');
    setImportance('all');
    setOfficialOnly(false);
    setMoreOpen(false);
    setOpenFilter(null);
  };

  if (selectedId) {
    return (
      <NewsArticleView
        item={selected}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onBack={closeArticle}
        onOpenRelated={openArticle}
        saved={selected ? savedIds.includes(selected.id) : false}
        onToggleSaved={() => {
          if (selected) toggleSaved(selected);
        }}
      />
    );
  }

  return (
    <section class="news-route" aria-label="Новости Таджикистана">
      <div class="news-viewport" ref={newsViewportRef}>
        <header class="news-header">
          <button type="button" class="news-brand" onClick={onNavigateMap} aria-label="Вернуться к карте">
            <span>Tajikistan</span>
            <span>Monitor</span>
          </button>
          <label class="news-global-search">
            <SearchIcon size={19} />
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder="Поиск по новостям, местам, источникам..."
              aria-label="Поиск по новостям, местам и источникам"
            />
            {query && (
              <button type="button" class="news-search-clear" onClick={() => setQuery('')} aria-label="Очистить поиск">
                <CloseIcon size={14} />
              </button>
            )}
          </label>
          <div class="news-header-actions">
            <button
              type="button"
              class="news-theme-toggle"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
            </button>
          </div>
        </header>

        <nav class="news-tabs" aria-label="Разделы новостей">
          {tabLabels.map((tab) => (
            <button
              type="button"
              class={`news-tab${activeTab === tab ? ' is-active' : ''}`}
              aria-current={activeTab === tab ? 'page' : undefined}
              onClick={() => setActiveTab(tab)}
              key={tab}
            >
              {tab}
              {tab === 'Главное' && <span class="news-tab-dot" aria-hidden="true" />}
            </button>
          ))}
        </nav>

        <div class="news-filter-bar" aria-label="Фильтры новостей">
          <div class="news-filter-scroll">
            <NewsDropdown
              filterKey="category"
              label="Категория"
              value={category}
              displayValue={category === 'Все' ? 'Категория' : category}
              options={demoNewsCategories}
              openFilter={openFilter}
              onToggle={(filterKey) => { setMoreOpen(false); setOpenFilter((current) => current === filterKey ? null : filterKey); }}
              onSelect={(value) => { setCategory(value); setOpenFilter(null); }}
            />
            <NewsDropdown
              filterKey="region"
              label="Регион"
              value={region}
              displayValue={region === 'Все регионы' ? 'Согдийская обл.' : region}
              options={demoNewsRegions}
              openFilter={openFilter}
              onToggle={(filterKey) => { setMoreOpen(false); setOpenFilter((current) => current === filterKey ? null : filterKey); }}
              onSelect={(value) => { setRegion(value); setOpenFilter(null); }}
            />
            <NewsDropdown
              filterKey="city"
              label="Город"
              value={city}
              displayValue={city === 'Все города' ? 'Город' : city}
              options={cityOptions}
              openFilter={openFilter}
              onToggle={(filterKey) => { setMoreOpen(false); setOpenFilter((current) => current === filterKey ? null : filterKey); }}
              onSelect={(value) => { setCity(value); setOpenFilter(null); }}
            />
            <NewsDropdown
              filterKey="importance"
              label="Важность"
              value={importance}
              displayValue={importance === 'all' ? 'Важность' : demoNewsImportanceOptions.find((option) => option.value === importance)?.label ?? 'Важность'}
              options={demoNewsImportanceOptions.map((option) => option.value)}
              openFilter={openFilter}
              onToggle={(filterKey) => { setMoreOpen(false); setOpenFilter((current) => current === filterKey ? null : filterKey); }}
              onSelect={(value) => { setImportance(value as DemoNewsImportance | 'all'); setOpenFilter(null); }}
            />
            <button type="button" class={`news-filter-chip${officialOnly ? ' is-selected' : ''}`} onClick={() => { setOpenFilter(null); setOfficialOnly((value) => !value); }}>
              <ShieldCheckIcon size={15} />
              <span>Официальные</span>
              {officialOnly && <CheckIcon size={13} />}
            </button>
            <div class="news-more-filter">
              <button type="button" class={`news-filter-chip${moreOpen ? ' is-selected' : ''}`} onClick={() => { setOpenFilter(null); setMoreOpen((value) => !value); }} aria-expanded={moreOpen}>
                <span>Ещё</span>
                <ChevronDownIcon size={14} />
              </button>
              {moreOpen && (
                <div class="news-filter-popover">
                  <p>Быстрые фильтры</p>
                  <button type="button" onClick={() => { setActiveTab('Последние'); setMoreOpen(false); }}>Только последние</button>
                  <button type="button" onClick={() => { setImportance('critical'); setMoreOpen(false); }}>Срочные сообщения</button>
                  <button type="button" onClick={() => { setCategory('ЧС'); setMoreOpen(false); }}>Чрезвычайные ситуации</button>
                  <button type="button" onClick={resetFilters}>Сбросить всё</button>
                </div>
              )}
            </div>
          </div>
          {openFilter && <div class="news-filter-overlay" aria-hidden="true" onClick={() => setOpenFilter(null)} />}
          <span class="news-filter-result" aria-live="polite">{selectionCount} {selectionCount === 1 ? 'новость' : 'новостей'}</span>
        </div>

        <main class="news-main-content">
          <section class="news-headline-grid" aria-labelledby="news-now-title">
            <div class="news-headline-main">
              <div class="news-headline-column">
                <div class="news-section-heading">
                  <div>
                    <span class="news-eyebrow">Обновляется каждые 5 минут</span>
                    <h1 id="news-now-title">Сейчас главное</h1>
                  </div>
                  <span class="news-demo-label">DEMO-ДАННЫЕ</span>
                </div>
                <button type="button" class="news-hero-card" onClick={() => openArticle(hero)}>
                  <NewsImage item={hero} className="news-hero-image" />
                  <span class="news-hero-scrim" aria-hidden="true" />
                  <span class="news-hero-copy">
                    <span class="news-hero-topline">
                      <span>{hero.isUrgent ? 'ОПЕРАТИВНО' : 'РЕКОМЕНДОВАНО'}</span>
                      <ImportanceBadge item={hero} />
                    </span>
                    <strong>{hero.title}</strong>
                    <span class="news-hero-meta">
                      <span>{hero.source}</span>
                      <span>•</span>
                      <span>{formatRelative(hero.publishedAt)}</span>
                    </span>
                  </span>
                  <ArrowRightIcon size={19} class="news-hero-arrow" />
                </button>
              </div>

              <div class="news-secondary-headlines" aria-label="Другие важные новости">
                {secondary.map((item) => (
                  <button type="button" class="news-secondary-card" onClick={() => openArticle(item)} key={item.id}>
                    <span class="news-secondary-copy">
                      <span class="news-secondary-label"><SourceLine item={item} compact /><ImportanceBadge item={item} compact /></span>
                      <strong>{item.title}</strong>
                      <span class="news-secondary-time">{formatRelative(item.publishedAt)}</span>
                    </span>
                    <span class={`news-secondary-icon ${importanceMeta[item.importance].className}`}>
                      {item.category === 'Экономика' ? <TrendingUpIcon size={21} /> : item.category === 'ЧС' ? <AlertTriangleIcon size={21} /> : <LayersIcon size={21} />}
                    </span>
                  </button>
                ))}
                {!secondary.length && <div class="news-no-results">Ничего не найдено. Попробуйте сбросить фильтры.</div>}
              </div>
            </div>

            <section class="news-quick-now" aria-labelledby="quick-now-title">
              <div class="news-section-heading compact">
                <div>
                  <span class="news-eyebrow">Сводка по стране</span>
                  <h2 id="quick-now-title">Коротко сейчас</h2>
                </div>
              </div>
              <div class="news-quick-grid">
                {quickNow.map((item) => (
                  <article class={`news-quick-card is-${item.tone}`} key={item.title}>
                    <span class="news-quick-icon">{item.icon}</span>
                    <strong>{item.title}</strong>
                    <b>{item.value}</b>
                    <span>{item.detail}</span>
                    <small>{item.meta}</small>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <section class="news-feed-section news-feed-section-full" aria-labelledby="news-feed-title">
              <div class="news-section-heading compact">
                <div>
                  <span class="news-eyebrow">Официальные источники и СМИ</span>
                  <h2 id="news-feed-title">Лента новостей</h2>
                </div>
                <span class="news-feed-count">{selectionCount} материалов</span>
              </div>
              <div class="news-feed-list" role="feed" aria-busy="false">
                {feed.map((item) => (
                  <article class={`news-feed-card ${importanceMeta[item.importance].className}`} key={item.id}>
                    <button type="button" class="news-feed-main" onClick={() => openArticle(item)}>
                      <NewsImage item={item} className="news-feed-image" />
                      <span class="news-feed-card-copy">
                        <span class="news-feed-card-topline">
                          <SourceLine item={item} compact />
                          <ImportanceBadge item={item} compact />
                          <time dateTime={item.publishedAt}>{formatRelative(item.publishedAt)}</time>
                        </span>
                        <strong>{item.title}</strong>
                        <span>{item.summary}</span>
                        <span class="news-feed-card-bottomline">
                          <span><MapPinIcon size={13} />{item.city}</span>
                          {item.recommended && <span class="news-recommended-label"><SparklesIcon size={12} />Рекомендуем</span>}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      class={`news-save-button${savedIds.includes(item.id) ? ' is-saved' : ''}`}
                      onClick={() => toggleSaved(item)}
                      aria-label={savedIds.includes(item.id) ? 'Убрать из сохранённых' : 'Сохранить новость'}
                      aria-pressed={savedIds.includes(item.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.75A2.75 2.75 0 0 1 8.75 2h6.5A2.75 2.75 0 0 1 18 4.75V21l-6-3.6L6 21V4.75Z" /></svg>
                    </button>
                  </article>
                ))}
                {!feed.length && (
                  <div class="news-empty-card">
                    <NewspaperIcon size={28} />
                    <strong>По этим фильтрам новостей нет</strong>
                    <span>Сбросьте фильтры или попробуйте другой запрос.</span>
                    <button type="button" class="news-outline-button" onClick={resetFilters}>Сбросить фильтры</button>
                  </div>
                )}
              </div>
          </section>

          <section class="news-miss-section" aria-labelledby="news-miss-title">
            <div class="news-section-heading compact">
              <div>
                <span class="news-eyebrow">Подборка редакции</span>
                <h2 id="news-miss-title">Не пропустите</h2>
              </div>
              <div class="news-carousel-actions">
                <button type="button" aria-label="Предыдущие рекомендации"><ChevronLeftIcon size={16} /></button>
                <button type="button" aria-label="Следующие рекомендации"><ChevronRightIcon size={16} /></button>
              </div>
            </div>
            <div class="news-miss-list">
              {missNews.map((item) => (
                <button type="button" class="news-miss-card" key={item.id} onClick={() => openArticle(item)}>
                  <span class="news-miss-image-wrap"><NewsImage item={item} className="news-miss-image" /><span class="news-miss-open"><ExternalLinkIcon size={14} /></span></span>
                  <span class="news-miss-copy"><span><SourceLine item={item} compact /><ImportanceBadge item={item} compact /></span><strong>{item.title}</strong></span>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>

    </section>
  );
}
