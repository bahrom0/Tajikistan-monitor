import { useEffect, useMemo, useState } from 'preact/hooks';
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

const nearbyRegions = [
  { name: 'Согдийская обл.', count: 18 },
  { name: 'Душанбе', count: 14 },
  { name: 'Хатлонская обл.', count: 9 },
  { name: 'ГБАО', count: 3 },
];

const officialDocs = [
  { title: 'Постановление Правительства РТ №512', description: 'О подготовке объектов ЖКХ к осенне-зимнему периоду 2024–2025 гг.', time: '2 ч назад' },
  { title: 'Распоряжение Председателя Согдийской области №210-р', description: 'О проведении месячника благоустройства и санитарной очистки', time: '4 ч назад' },
  { title: 'Приказ Минтранса РТ №145', description: 'Об утверждении графика движения пригородных маршрутов', time: '6 ч назад' },
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

export function NewsPage({ theme, onToggleTheme, onNavigateMap }: NewsPageProps) {
  const [activeTab, setActiveTab] = useState<NewsTab>('Главное');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [region, setRegion] = useState('Все регионы');
  const [importance, setImportance] = useState<DemoNewsImportance | 'all'>('all');
  const [officialOnly, setOfficialOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => getNewsIdFromPath());
  const [aiExpanded, setAiExpanded] = useState(true);

  const selected = selectedId ? demoNews.find((item) => item.id === selectedId) ?? null : null;

  useEffect(() => {
    const handlePopState = () => setSelectedId(getNewsIdFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    setAiExpanded(true);
    if (selectedId) document.body.classList.add('news-dialog-open');
    else document.body.classList.remove('news-dialog-open');
    return () => document.body.classList.remove('news-dialog-open');
  }, [selectedId]);

  const openArticle = (item: DemoNewsItem) => {
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
        const matchesImportance = importance === 'all' || item.importance === importance;
        const matchesSource = !officialOnly || item.sourceKind === 'official';
        return matchesTab && matchesQuery && matchesCategory && matchesRegion && matchesImportance && matchesSource;
      })
      .sort((left, right) => {
        if (activeTab === 'Последние') return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
        if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
        if (importanceScore[left.importance] !== importanceScore[right.importance]) return importanceScore[right.importance] - importanceScore[left.importance];
        return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
      });
  }, [activeTab, category, importance, officialOnly, query, region]);

  const hero = filteredNews[0] ?? demoNews[0];
  const secondary = filteredNews.slice(1, 3);
  const feed = filteredNews.slice(0, 6);
  const selectionCount = filteredNews.length;

  const resetFilters = () => {
    setQuery('');
    setCategory('Все');
    setRegion('Все регионы');
    setImportance('all');
    setOfficialOnly(false);
    setMoreOpen(false);
  };

  return (
    <section class="news-route" aria-label="Новости Таджикистана">
      <div class="news-viewport">
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
            <span class="news-avatar" aria-label="Профиль пользователя">Б</span>
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
            <label class="news-filter-control">
              <span class="sr-only">Категория</span>
              <select value={category} onChange={(event) => setCategory(event.currentTarget.value)} aria-label="Категория">
                {demoNewsCategories.map((option) => <option value={option} key={option}>{option === 'Все' ? 'Категория' : option}</option>)}
              </select>
              <ChevronDownIcon size={14} />
            </label>
            <label class="news-filter-control">
              <span class="sr-only">Регион</span>
              <select value={region} onChange={(event) => setRegion(event.currentTarget.value)} aria-label="Регион">
                {demoNewsRegions.map((option) => <option value={option} key={option}>{option === 'Все регионы' ? 'Согдийская обл.' : option}</option>)}
              </select>
              <ChevronDownIcon size={14} />
            </label>
            <label class="news-filter-control">
              <span class="sr-only">Важность</span>
              <select value={importance} onChange={(event) => setImportance(event.currentTarget.value as DemoNewsImportance | 'all')} aria-label="Важность">
                {demoNewsImportanceOptions.map((option) => <option value={option.value} key={option.value}>{option.value === 'all' ? 'Важность' : option.label}</option>)}
              </select>
              <ChevronDownIcon size={14} />
            </label>
            <button type="button" class={`news-filter-chip${officialOnly ? ' is-selected' : ''}`} onClick={() => setOfficialOnly((value) => !value)}>
              <ShieldCheckIcon size={15} />
              <span>Официальные</span>
              {officialOnly && <CheckIcon size={13} />}
            </button>
            <div class="news-more-filter">
              <button type="button" class={`news-filter-chip${moreOpen ? ' is-selected' : ''}`} onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}>
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
          <span class="news-filter-result">{selectionCount} {selectionCount === 1 ? 'новость' : 'новостей'}</span>
        </div>

        <main class="news-main-content">
          <section class="news-headline-grid" aria-labelledby="news-now-title">
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

          <section class="news-lower-grid">
            <section class="news-nearby-section" aria-labelledby="news-nearby-title">
              <div class="news-section-heading compact">
                <div>
                  <span class="news-eyebrow">Локальный контекст</span>
                  <h2 id="news-nearby-title">Что происходит рядом</h2>
                </div>
                <button type="button" class="news-text-link" onClick={onNavigateMap}>Открыть карту <ArrowRightIcon size={14} /></button>
              </div>
              <div class="news-nearby-card">
                <div class="news-map-preview" aria-label="Демонстрационный слой карты Таджикистана">
                  <span class="news-map-label news-map-label-one">Согд</span>
                  <span class="news-map-label news-map-label-two">Хатлон</span>
                  <span class="news-map-label news-map-label-three">ГБАО</span>
                  <span class="news-map-pin pin-one" />
                  <span class="news-map-pin pin-two" />
                  <span class="news-map-pin pin-three" />
                  <span class="news-map-demo-note">Демо-слой территорий</span>
                </div>
                <div class="news-nearby-list">
                  {nearbyRegions.map((item) => (
                    <button type="button" class="news-nearby-row" key={item.name} onClick={onNavigateMap}>
                      <span>{item.name}</span>
                      <strong>{item.count}</strong>
                      <ChevronRightIcon size={15} />
                    </button>
                  ))}
                  <button type="button" class="news-outline-button" onClick={onNavigateMap}>Открыть карту</button>
                </div>
              </div>
            </section>

            <section class="news-feed-section" aria-labelledby="news-feed-title">
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
          </section>

          <section class="news-discovery-grid">
            <section class="news-discovery-section" aria-labelledby="news-official-title">
              <div class="news-section-heading compact">
                <div>
                  <span class="news-eyebrow">Проверенные документы</span>
                  <h2 id="news-official-title">Официально</h2>
                </div>
                <button type="button" class="news-text-link">Все документы <ArrowRightIcon size={14} /></button>
              </div>
              <div class="news-documents-card">
                {officialDocs.map((document) => (
                  <button type="button" class="news-document-row" key={document.title}>
                    <span class="news-document-icon"><BookOpenIcon size={16} /></span>
                    <span><strong>{document.title}</strong><small>{document.description}</small></span>
                    <time>{document.time}</time>
                  </button>
                ))}
              </div>
            </section>

            <section class="news-discovery-section" aria-labelledby="news-popular-title">
              <div class="news-section-heading compact">
                <div>
                  <span class="news-eyebrow">Что читают сейчас</span>
                  <h2 id="news-popular-title">Популярно сейчас</h2>
                </div>
                <span class="news-live-mark"><span />LIVE</span>
              </div>
              <div class="news-popular-card">
                {demoNews.slice(0, 5).map((item, index) => (
                  <button type="button" class="news-popular-row" key={item.id} onClick={() => openArticle(item)}>
                    <span class="news-popular-rank">{index + 1}</span>
                    <span><strong>{item.title}</strong><small>{item.category} · {item.source}</small></span>
                    <span class="news-popular-trend">{index === 0 ? '↓ 0.03' : index === 1 ? '—' : `↑ ${index + 4}`}</span>
                  </button>
                ))}
              </div>
            </section>
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
              {demoNews.slice(4, 9).map((item) => (
                <button type="button" class="news-miss-card" key={item.id} onClick={() => openArticle(item)}>
                  <span class="news-miss-image-wrap"><NewsImage item={item} className="news-miss-image" /><span class="news-miss-open"><ExternalLinkIcon size={14} /></span></span>
                  <span class="news-miss-copy"><span><SourceLine item={item} compact /><ImportanceBadge item={item} compact /></span><strong>{item.title}</strong></span>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>

      {selected && (
        <div class="news-detail-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeArticle(); }}>
          <article class="news-detail-panel" role="dialog" aria-modal="true" aria-labelledby="news-detail-title">
            <button type="button" class="news-detail-close" onClick={closeArticle} aria-label="Закрыть новость"><CloseIcon size={19} /></button>
            <div class="news-detail-cover">
              <NewsImage item={selected} className="news-detail-image" />
              <span class="news-detail-cover-label">{selected.demo ? 'Демонстрационный материал' : 'Источник'}</span>
            </div>
            <div class="news-detail-body">
              <div class="news-detail-source-row">
                <SourceLine item={selected} />
                <ImportanceBadge item={selected} />
              </div>
              <div class="news-detail-dates">
                <span><BookOpenIcon size={15} />Опубликовано: {formatDateTime(selected.publishedAt)}</span>
                <span><TrendingUpIcon size={15} />Обновлено: {formatDateTime(selected.updatedAt)}</span>
              </div>
              <h1 id="news-detail-title">{selected.title}</h1>
              <p class="news-detail-lead">{selected.summary}</p>
              <div class="news-detail-tags">
                <span><MapPinIcon size={14} />{selected.region} / {selected.city}</span>
                <span><LayersIcon size={14} />{selected.category}</span>
              </div>
              <div class={`news-detail-importance ${importanceMeta[selected.importance].className}`}>
                <ShieldCheckIcon size={18} />
                <span><strong>{selected.isUrgent ? 'Срочное официальное сообщение' : `${importanceMeta[selected.importance].label} важность`}</strong><small>{selected.isUrgent ? 'Следите за обновлениями служб' : 'Уровень рассчитан по источнику, теме и охвату'}</small></span>
              </div>
              <section class={`news-ai-summary${aiExpanded ? ' is-open' : ''}`}>
                <button type="button" class="news-ai-summary-head" onClick={() => setAiExpanded((value) => !value)} aria-expanded={aiExpanded}>
                  <span class="news-ai-icon"><SparklesIcon size={21} /></span>
                  <span><strong>AI-кратко</strong><small>Понятное объяснение без сложных вопросов</small></span>
                  <ChevronDownIcon size={18} />
                </button>
                {aiExpanded && (
                  <div class="news-ai-summary-content">
                    <p>{selected.aiSummary}</p>
                    <ul>{selected.aiFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                  </div>
                )}
              </section>
              <section class="news-why-card">
                <span class="news-why-icon"><LightbulbIcon size={19} /></span>
                <span><strong>Почему показано</strong><small>{selected.recommendationReason}</small></span>
                <CheckIcon size={17} />
              </section>
              <div class="news-detail-article-copy">
                <h2>Подробности</h2>
                {selected.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
              <div class="news-detail-actions">
                <a href={selected.originalUrl} target="_blank" rel="noreferrer" class="news-original-link">Открыть оригинал <ExternalLinkIcon size={15} /></a>
                <button type="button" class={`news-detail-save${savedIds.includes(selected.id) ? ' is-saved' : ''}`} onClick={() => toggleSaved(selected)}>
                  {savedIds.includes(selected.id) ? 'Сохранено' : 'Сохранить'}
                </button>
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
