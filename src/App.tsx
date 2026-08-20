import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MarkdownContent, type CitationSource } from './components/MarkdownContent';
import { TajikistanMap, type GeographyFilter, type LocationSummarySelection, type PlaceResearchSelection } from './components/TajikistanMap';
import {
  SunIcon,
  MoonIcon,
  RefreshIcon,
  SparklesIcon,
  SearchIcon,
  NewspaperIcon,
  ExternalLinkIcon,
  CloseIcon,
  AlertTriangleIcon,
  AppleSpinner,
  CheckIcon,
} from './components/icons';
import type { NewsItem, SourceStatus } from './types';

const formatTime = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(date));

type ResearchStage = { id: string; label: string; state: 'active' | 'done' | 'error' };
type ResearchSource = CitationSource;
type ResearchEvent =
  | { type: 'status'; id: string; label: string }
  | { type: 'sources'; items: ResearchSource[] }
  | { type: 'token'; value: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export function App() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [category, setCategory] = useState('Все');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [locationSummary, setLocationSummary] = useState<LocationSummarySelection | null>(null);
  const [placeResearch, setPlaceResearch] = useState<PlaceResearchSelection | null>(null);
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [researchStages, setResearchStages] = useState<ResearchStage[]>([]);
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const aiRequest = useRef<AbortController | null>(null);
  const [geographyFilter, setGeographyFilter] = useState<GeographyFilter>({ regionId: 'all', districtId: 'all' });
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [isAlertToastOpen, setIsAlertToastOpen] = useState(false);
  const [isAlertToastClosing, setIsAlertToastClosing] = useState(false);
  const [resetViewTrigger, setResetViewTrigger] = useState(0);
  const isAlertToastOpenRef = useRef(false);
  const isAlertToastClosingRef = useRef(false);
  isAlertToastOpenRef.current = isAlertToastOpen;
  isAlertToastClosingRef.current = isAlertToastClosing;
  const toastTimerRef = useRef<number | null>(null);
  const closeAnimTimerRef = useRef<number | null>(null);

  const dismissAlertToast = (afterClose?: () => void) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (!isAlertToastOpenRef.current || isAlertToastClosingRef.current) {
      afterClose?.();
      return;
    }
    setIsAlertToastClosing(true);
    if (closeAnimTimerRef.current) clearTimeout(closeAnimTimerRef.current);
    closeAnimTimerRef.current = window.setTimeout(() => {
      setIsAlertToastOpen(false);
      setIsAlertToastClosing(false);
      afterClose?.();
    }, 280);
  };

  const handleAlertRestriction = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (closeAnimTimerRef.current) clearTimeout(closeAnimTimerRef.current);
    setIsAlertToastClosing(false);
    setIsAlertToastOpen(true);
  };

  // Auto-dismiss alert toast strictly after 5 seconds
  useEffect(() => {
    if (!isAlertToastOpen || isAlertToastClosing) return;
    const timer = window.setTimeout(() => {
      dismissAlertToast();
    }, 5000);
    return () => clearTimeout(timer);
  }, [isAlertToastOpen, isAlertToastClosing]);

  const disableAlertMode = () => {
    dismissAlertToast(() => {
      setAlertsOnly(false);
      setResetViewTrigger((count) => count + 1);
    });
  };

  const handleEmptyMapClick = () => {
    if (alertsOnly) {
      dismissAlertToast(() => {
        setAlertsOnly(false);
      });
    }
  };

  // Navigation & Settings state
  const [activeNav, setActiveNav] = useState<'map' | 'chat' | 'news'>('map');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGeneralAiOpen, setIsGeneralAiOpen] = useState(false);
  const [generalAiQuery, setGeneralAiQuery] = useState('');
  const [generalAiAnswer, setGeneralAiAnswer] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('tj_monitor_theme') as 'dark' | 'light') || 'dark';
  });
  const [language, setLanguage] = useState<'ru' | 'tg'>(() => {
    return (localStorage.getItem('tj_monitor_lang') as 'ru' | 'tg') || 'ru';
  });
  const [refreshInterval, setRefreshInterval] = useState<number>(300000);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tj_monitor_theme', theme);
  }, [theme]);

  // Apply language
  useEffect(() => {
    localStorage.setItem('tj_monitor_lang', language);
  }, [language]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const [newsResponse, statusResponse] = await Promise.all([
        fetch(`/api/news${refresh ? '?refresh=1' : ''}`),
        fetch('/api/status'),
      ]);
      const newsData = await newsResponse.json();
      const statusData = await statusResponse.json();
      setNews(newsData.items || []);
      setStatuses(statusData.sources || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  useEffect(() => () => aiRequest.current?.abort(), []);

  const categories = useMemo(() => ['Все', ...new Set(news.map((item) => item.category))], [news]);

  const filtered = news.filter((item) => {
    const matchesGeography =
      geographyFilter.districtId !== 'all'
        ? (item.locations ?? []).some(
            (location) =>
              location.locationId === geographyFilter.districtId ||
              location.districtId === geographyFilter.districtId,
          )
        : geographyFilter.regionId === 'all' ||
          (item.locations ?? []).some(
            (location) =>
              location.locationId === geographyFilter.regionId ||
              location.regionId === geographyFilter.regionId,
          );
    return (
      matchesGeography &&
      (category === 'Все' || item.category === category) &&
      `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())
    );
  });

  const online = statuses.filter((source) => source.status === 'online').length;

  const streamAi = async (path: string, body: unknown, fallbackError: string) => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAsking(true);
    setAnswer('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `AI provider: HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('Браузер не получил поток ответа.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let received = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const token = decoder.decode(value, { stream: true });
        if (!token) continue;
        received = true;
        setAnswer((current) => current + token);
      }
      const tail = decoder.decode();
      if (tail) {
        received = true;
        setAnswer((current) => current + tail);
      }
      if (!received) setAnswer('Ответ не получен.');
    } catch (error) {
      if (!controller.signal.aborted) setAnswer(error instanceof Error ? error.message : fallbackError);
    } finally {
      if (aiRequest.current === controller) {
        aiRequest.current = null;
        setAsking(false);
      }
    }
  };

  const askAi = async () => {
    if (!selected) return;
    await streamAi('/api/ai/explain', selected, 'Сервис объяснений сейчас недоступен.');
  };

  const askGeneralAi = async () => {
    if (!generalAiQuery.trim()) return;
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAsking(true);
    setGeneralAiAnswer('');
    try {
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Вопрос пользователя',
          description: generalAiQuery,
          category: 'Общий вопрос',
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `AI error: HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('Браузер не получил поток ответа.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const token = decoder.decode(value, { stream: true });
        if (token) setGeneralAiAnswer((current) => current + token);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setGeneralAiAnswer(error instanceof Error ? error.message : 'Не удалось получить ответ от ИИ.');
      }
    } finally {
      if (aiRequest.current === controller) {
        aiRequest.current = null;
        setAsking(false);
      }
    }
  };

  const streamPlaceResearch = async (selection: PlaceResearchSelection) => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAsking(true);
    setAnswer('');
    setResearchStages([]);
    setResearchSources([]);
    const acceptEvent = (event: ResearchEvent) => {
      if (event.type === 'status') {
        setResearchStages((current) => {
          const previous = current.map((stage) => ({
            ...stage,
            state: stage.state === 'error' ? ('error' as const) : ('done' as const),
          }));
          const existing = previous.findIndex((stage) => stage.id === event.id);
          const next = { id: event.id, label: event.label, state: 'active' as const };
          if (existing >= 0) return previous.map((stage, index) => (index === existing ? next : stage));
          return [...previous, next];
        });
      } else if (event.type === 'sources') {
        setResearchSources(event.items);
      } else if (event.type === 'token') {
        setAnswer((current) => current + event.value);
      } else if (event.type === 'error') {
        setResearchStages((current) => [
          ...current.map((stage) => ({ ...stage, state: 'done' as const })),
          { id: 'error', label: event.message, state: 'error' },
        ]);
      } else if (event.type === 'done') {
        setResearchStages((current) =>
          current.map((stage) => ({
            ...stage,
            state: stage.state === 'error' ? ('error' as const) : ('done' as const),
          })),
        );
      }
    };
    try {
      const response = await fetch('/api/ai/place-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selection.locationId, periodDays: selection.periodDays }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Place research: HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('Браузер не получил поток исследования.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) if (line.trim()) acceptEvent(JSON.parse(line) as ResearchEvent);
        if (done) break;
      }
      if (buffer.trim()) acceptEvent(JSON.parse(buffer) as ResearchEvent);
    } catch (error) {
      if (!controller.signal.aborted)
        acceptEvent({
          type: 'error',
          message: error instanceof Error ? error.message : 'Сервис исследования места недоступен.',
        });
    } finally {
      if (aiRequest.current === controller) {
        aiRequest.current = null;
        setAsking(false);
      }
    }
  };

  const openLocationSummary = (selection: LocationSummarySelection) => {
    setSelected(null);
    setPlaceResearch(null);
    setLocationSummary(selection);
    void streamAi(
      '/api/ai/location-summary',
      {
        locationId: selection.locationId,
        locationNameRu: selection.nameRu,
        locationNameTg: selection.nameTg,
        articles: selection.articles.map(
          ({ title, description, sourceName, publishedAt, category, severity, url }) => ({
            title,
            description,
            sourceName,
            publishedAt,
            category,
            severity,
            url,
          }),
        ),
      },
      'Сервис сумари сейчас недоступен.',
    );
  };

  const openPlaceResearch = (selection: PlaceResearchSelection) => {
    setSelected(null);
    setLocationSummary(null);
    setPlaceResearch(selection);
    void streamPlaceResearch(selection);
  };

  const closeAi = () => {
    aiRequest.current?.abort();
    setSelected(null);
    setLocationSummary(null);
    setPlaceResearch(null);
    setAnswer('');
    setResearchStages([]);
    setResearchSources([]);
    setAsking(false);
  };

  return (
    <div class="app-shell">
      {/* Left Pill Navigation Bar (Apple Style) */}
      <aside class="sidebar-nav" aria-label="Основная навигация">
        <div class="sidebar-brand" title="Tajikistan Monitor">
          <img src="/logo.png" alt="Tajikistan Monitor" class="sidebar-brand-img" />
        </div>

        <nav class="sidebar-menu">
          <button
            type="button"
            class={`nav-item-btn${activeNav === 'map' ? ' is-active' : ''}`}
            onClick={() => setActiveNav('map')}
            title="Карта Таджикистана"
            aria-label="Карта"
          >
            <span class="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zm7-4v16m8-12v16" />
              </svg>
            </span>
            <span class="nav-label">Карта</span>
          </button>

          <button
            type="button"
            class={`nav-item-btn${activeNav === 'chat' ? ' is-active' : ''}`}
            onClick={() => {
              setActiveNav('chat');
              setIsGeneralAiOpen(true);
            }}
            title="ИИ Помощник и Анализ"
            aria-label="ИИ чат"
          >
            <span class="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </span>
            <span class="nav-label">ИИ чат</span>
          </button>

          <button
            type="button"
            class={`nav-item-btn${activeNav === 'news' ? ' is-active' : ''}`}
            onClick={() => setActiveNav('news')}
            title="Лента новостей"
            aria-label="Новости"
          >
            <span class="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m4 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M9 9h6m-6 4h6m-6 4h4" />
              </svg>
            </span>
            <span class="nav-label">Новости</span>
          </button>
        </nav>

        <div class="sidebar-footer">
          <button
            type="button"
            class="nav-item-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Настройки"
            aria-label="Настройки"
          >
            <span class="nav-icon">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            <span class="nav-label">Настройки</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div class="main-container">
        {/* Topbar */}
        <header class="topbar">
          <div class="topbar-left">
            <img src="/logo.png" alt="Tajikistan Monitor" class="topbar-logo" />
            <div class="brand-title">
              <h1>TAJIKISTAN MONITOR</h1>
              <span>Национальная информационная панель</span>
            </div>
          </div>

          <div class="topbar-center">
            <span class="status-pill">
              <span class="status-pill-dot" />
              Обновлено
            </span>
            <span class="stat-chip">
              Источники <b>{online}/{statuses.length || 7}</b>
            </span>
            <span class="stat-chip">
              Обновление <b>5 мин</b>
            </span>
          </div>

          <div class="topbar-right">
            <button
              type="button"
              class="btn-icon"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
              aria-label="Переключить тему"
            >
              {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
            <button
              type="button"
              class="btn-primary"
              onClick={() => void load(true)}
              disabled={loading}
              title="Обновить данные"
            >
              <RefreshIcon size={15} class={loading ? 'icon-spin' : ''} />
              <span>{loading ? 'Обновление…' : 'Обновить'}</span>
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <main class="dashboard">
          {/* Left Panel: Sources & Overview */}
          <aside class="panel-card left-panel" aria-label="Сводка и источники">
            <div class="panel-header">
              <h2>Статус источников</h2>
              <span class="badge">{online} ONLINE</span>
            </div>
            <div class="left-panel-content">
              <div class="source-list">
                {(statuses.length
                  ? statuses
                  : [
                      {
                        id: 'loading',
                        name: 'Подключение к API',
                        status: 'offline',
                        count: 0,
                        checkedAt: '',
                      } as SourceStatus,
                    ]
                ).map((source) => (
                  <div class="source-item" key={source.id}>
                    <span class={`source-dot ${source.status}`} />
                    <div class="source-info">
                      <strong>{source.name}</strong>
                      <small>
                        {source.status === 'online'
                          ? `${source.count} записей`
                          : source.status === 'degraded'
                            ? 'изменилась разметка'
                            : 'ожидание ответа'}
                      </small>
                    </div>
                    <span class="source-status-text">
                      {loading ? (
                        <AppleSpinner size={13} class="source-spinner" />
                      ) : source.status === 'online' ? (
                        'OK'
                      ) : source.status === 'degraded' ? (
                        'WARN'
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <div class="section-title">Обзор</div>
                <div class="metric-grid">
                  <button
                    type="button"
                    class="metric-card metric-card-btn"
                    onClick={() => setActiveNav('news')}
                    title="Открыть ленту новостей"
                  >
                    <small>Новостей</small>
                    <b>{loading && !news.length ? <AppleSpinner size={18} class="metric-spinner" /> : news.length}</b>
                  </button>
                  <button
                    type="button"
                    class={`metric-card metric-card-btn${alertsOnly ? ' is-active' : ''}`}
                    onClick={() => {
                      setGeographyFilter({ regionId: 'all', districtId: 'all' });
                      setAlertsOnly((prev) => !prev);
                    }}
                    title={alertsOnly ? 'Показать все точки на карте' : 'Показать только тревоги на карте'}
                  >
                    <small>Тревог</small>
                    <b class="warn">
                      {loading && !news.length ? (
                        <AppleSpinner size={18} class="metric-spinner" />
                      ) : (
                        news.filter((n) => n.severity === 'alert').length
                      )}
                    </b>
                  </button>
                  <div class="metric-card" title="Температура в Душанбе (заглушка)">
                    <small>Погода</small>
                    <b>{loading ? <AppleSpinner size={18} class="metric-spinner" /> : '+38°'}</b>
                  </div>
                  <div class="metric-card" title="Курс USD/TJS от НБТ (заглушка)">
                    <small>Курс $</small>
                    <b>{loading ? <AppleSpinner size={18} class="metric-spinner" /> : '10.93'}</b>
                  </div>
                </div>
              </div>

              <div>
                <div class="section-title">Легенда карты</div>
                <div class="legend-list">
                  <div class="legend-item">
                    <span class="legend-swatch region" />
                    <span>Область / Вилоят</span>
                  </div>
                  <div class="legend-item">
                    <span class="legend-swatch district" />
                    <span>Район / Ноҳия</span>
                  </div>
                  <div class="legend-item">
                    <span class="legend-swatch city" />
                    <span>Город / Шаҳр</span>
                  </div>
                  <div class="legend-item">
                    <span class="legend-swatch capital" />
                    <span>Столица / Пойтахт</span>
                  </div>
                </div>
              </div>

              <div class="info-banner">
                <strong>Официальный монитор</strong>
                <p>Все геоданные проверены по каноническому классификатору Таджикистана.</p>
              </div>
            </div>
          </aside>

          {/* Center: Map Stage */}
          <section class="map-stage" aria-label="Карта Таджикистана">
            <TajikistanMap
              theme={theme}
              news={filtered}
              alertsOnly={alertsOnly}
              resetViewTrigger={resetViewTrigger}
              onGeographyFilterChange={setGeographyFilter}
              onLocationSummary={openLocationSummary}
              onPlaceResearch={openPlaceResearch}
              onAlertRestriction={handleAlertRestriction}
              onEmptyMapClick={handleEmptyMapClick}
            />
            <div class="map-heading-pill">
              <span>Оперативная карта</span>
              <h2>Республика Таджикистан</h2>
            </div>
            <div class="map-badge">38.8610° N · 71.2761° E</div>
          </section>

          {/* Right: News Panel */}
          <aside class="panel-card news-panel" aria-label="Лента новостей">
            <div class="panel-header">
              <h2>Последние новости</h2>
              <span class="badge">{filtered.length}</span>
            </div>

            <div class="news-search-bar">
              <div class="search-input-wrapper">
                <SearchIcon size={15} class="search-icon" />
                <input
                  type="search"
                  value={query}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Поиск по новостям…"
                  aria-label="Поиск по новостям"
                />
              </div>
            </div>

            <div class="category-filter-pills" role="tablist">
              {categories.map((item) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={category === item}
                  class={`filter-pill-btn${category === item ? ' is-active' : ''}`}
                  key={item}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div class="news-feed-list" role="feed">
              {loading && !news.length ? (
                <div class="news-empty-state">
                  <span class="news-empty-icon"><AppleSpinner size={36} /></span>
                  <p>Загрузка официальных источников…</p>
                </div>
              ) : filtered.map((item) => (
                <article
                  class={`news-card ${item.severity}`}
                  key={item.id}
                  onClick={() => {
                    aiRequest.current?.abort();
                    setSelected(item);
                    setAnswer('');
                    setAsking(false);
                  }}
                >
                  <div class="news-meta">
                    <span class="news-source-tag">{item.sourceName}</span>
                    <time class="news-time">{formatTime(item.publishedAt)}</time>
                  </div>
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                  <div class="news-card-footer">
                    <span class="category-badge">{item.category}</span>
                    <span class="ai-explain-btn">
                      <SparklesIcon size={12} />
                      <span>ИИ-обзор</span>
                    </span>
                  </div>
                </article>
              ))}
              {!loading && !filtered.length && (
                <div class="news-empty-state">
                  <span class="news-empty-icon"><NewspaperIcon size={32} /></span>
                  <p>По выбранным фильтрам новостей нет.</p>
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>

      {/* Mobile Bottom Navigation (< 768px) */}
      <nav class="mobile-bottom-nav" aria-label="Мобильная навигация">
        <button
          type="button"
          class={`mobile-nav-btn${activeNav === 'map' ? ' is-active' : ''}`}
          onClick={() => setActiveNav('map')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zm7-4v16m8-12v16" />
          </svg>
          <span>Карта</span>
        </button>

        <button
          type="button"
          class={`mobile-nav-btn${activeNav === 'news' ? ' is-active' : ''}`}
          onClick={() => setActiveNav('news')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m4 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M9 9h6m-6 4h6m-6 4h4" />
          </svg>
          <span>Новости</span>
        </button>

        <button
          type="button"
          class={`mobile-nav-btn${activeNav === 'chat' ? ' is-active' : ''}`}
          onClick={() => {
            setActiveNav('chat');
            setIsGeneralAiOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span>ИИ чат</span>
        </button>

        <button
          type="button"
          class="mobile-nav-btn"
          onClick={() => setIsSettingsOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Настройки</span>
        </button>
      </nav>

      {/* AI Explainer / Place Research / Location Summary Modal */}
      {(selected || locationSummary || placeResearch) && (
        <div class="modal-backdrop" onClick={closeAi}>
          <section class="ai-modal-card" onClick={(event) => event.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-header-info">
                <span class="modal-category-label">
                  {placeResearch
                    ? 'AI Place Research'
                    : locationSummary
                      ? 'AI Location Summary'
                      : 'AI News Explainer'}
                </span>
                <h2>
                  {placeResearch
                    ? `Исследование: ${placeResearch.nameRu}`
                    : locationSummary
                      ? `Сумари: ${locationSummary.nameRu}`
                      : selected?.title}
                </h2>
              </div>
              <button type="button" class="modal-close-btn" onClick={closeAi} aria-label="Закрыть">
                <CloseIcon size={16} />
              </button>
            </div>

            <div class="modal-body">
              <p class="modal-original-text">
                {placeResearch
                  ? `${placeResearch.nameTg} · ${placeResearch.parentLabel} · период ${placeResearch.periodDays} дней`
                  : locationSummary
                    ? `${locationSummary.articles.length} публикаций${locationSummary.nameTg ? ` · ${locationSummary.nameTg}` : ''}`
                    : selected?.description || 'Описание отсутствует в RSS.'}
              </p>

              {!locationSummary && !placeResearch && !answer && (
                <button
                  type="button"
                  class="ai-action-btn"
                  onClick={() => void askAi()}
                  disabled={asking}
                >
                  <SparklesIcon size={16} />
                  <span>{asking ? 'Анализирую данные…' : 'Объяснить простыми словами'}</span>
                </button>
              )}

              {locationSummary && asking && !answer && (
                <div class="stat-chip" role="status">
                  Собираю сумари из новостей…
                </div>
              )}

              {placeResearch && (
                <div class="research-trace" aria-live="polite" aria-label="Ход веб-исследования">
                  <div class="research-trace-title">
                    <span>Поиск данных</span>
                    <span class="research-trace-status">
                      {asking ? (
                        <AppleSpinner size={15} class="research-status-spinner" />
                      ) : researchStages.some((stage) => stage.state === 'error') ? (
                        'ОШИБКА'
                      ) : (
                        'ГОТОВО'
                      )}
                    </span>
                  </div>
                  <ol class="research-steps">
                    {researchStages.map((stage) => (
                      <li class={stage.state} key={stage.id}>
                        {stage.state === 'active' ? (
                          <AppleSpinner size={14} class="stage-spinner" />
                        ) : stage.state === 'done' ? (
                          <span class="stage-check-badge">
                            <CheckIcon size={9} strokeWidth={3} />
                          </span>
                        ) : stage.state === 'error' ? (
                          <span class="stage-error-badge">✕</span>
                        ) : (
                          <i aria-hidden="true" />
                        )}
                        <span>{stage.label}</span>
                      </li>
                    ))}
                  </ol>
                  {!!researchSources.some((source) => source.type === 'requested_web') && (
                    <div style={{ marginTop: '12px' }}>
                      <div class="section-title">
                        Посещённые сайты ·{' '}
                        {researchSources.filter((source) => source.type === 'requested_web').length}
                      </div>
                      <div class="visited-sites-grid">
                        {researchSources
                          .filter((source) => source.type === 'requested_web')
                          .map((source, index) => (
                            <a
                              key={source.id}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              class="stat-chip visited-site-chip"
                              style={{ animationDelay: `${index * 55}ms` }}
                              title={source.title}
                            >
                              <span>{source.domain}</span>
                              <ExternalLinkIcon size={12} />
                            </a>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {answer && (
                <div class="ai-response-box" aria-live="polite">
                  <div class="ai-response-title">
                    {placeResearch
                      ? 'Ответ исследователя'
                      : locationSummary
                        ? 'Сумари новостей'
                        : 'Понятное объяснение'}
                  </div>
                  <MarkdownContent content={answer} sources={placeResearch ? researchSources : []} />
                </div>
              )}

              {selected?.url && (
                <a href={selected.url} target="_blank" rel="noreferrer" class="modal-footer-link">
                  <span>Открыть официальный источник</span>
                  <ExternalLinkIcon size={14} />
                </a>
              )}
            </div>
          </section>
        </div>
      )}

      {/* General AI Chat Modal */}
      {isGeneralAiOpen && (
        <div class="modal-backdrop" onClick={() => setIsGeneralAiOpen(false)}>
          <section class="ai-modal-card" onClick={(event) => event.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-header-info">
                <span class="modal-category-label">ИИ Ассистент</span>
                <h2>Задать вопрос по Таджикистану</h2>
              </div>
              <button
                type="button"
                class="modal-close-btn"
                onClick={() => setIsGeneralAiOpen(false)}
                aria-label="Закрыть"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div class="modal-body">
              <p class="modal-original-text">
                Задайте вопрос о событиях, погоде, курсах валют или географических локациях Таджикистана.
              </p>

              <div class="search-input-wrapper" style={{ padding: '10px 14px' }}>
                <input
                  type="text"
                  value={generalAiQuery}
                  onInput={(e) => setGeneralAiQuery(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void askGeneralAi();
                  }}
                  placeholder="Например: Какая ситуация с погодой в Душанбе?"
                  style={{ fontSize: '13px' }}
                />
              </div>

              <button
                type="button"
                class="ai-action-btn"
                onClick={() => void askGeneralAi()}
                disabled={asking || !generalAiQuery.trim()}
              >
                <SparklesIcon size={16} />
                <span>{asking ? 'ИИ думает…' : 'Отправить вопрос'}</span>
              </button>

              {generalAiAnswer && (
                <div class="ai-response-box">
                  <div class="ai-response-title">Ответ ИИ</div>
                  <MarkdownContent content={generalAiAnswer} />
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div class="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <section class="settings-modal-card" onClick={(event) => event.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-header-info">
                <span class="modal-category-label">Параметры</span>
                <h2>Настройки монитора</h2>
              </div>
              <button
                type="button"
                class="modal-close-btn"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Закрыть"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div class="settings-section">
              <div class="settings-row">
                <div class="settings-label">
                  <strong>Тема оформления</strong>
                  <small>Глубокая тёмная или светлая</small>
                </div>
                <div class="segmented-control">
                  <button
                    type="button"
                    class={`segmented-btn${theme === 'dark' ? ' is-active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    Тёмная
                  </button>
                  <button
                    type="button"
                    class={`segmented-btn${theme === 'light' ? ' is-active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    Светлая
                  </button>
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <strong>Язык интерфейса</strong>
                  <small>Русский или Таджикский</small>
                </div>
                <div class="segmented-control">
                  <button
                    type="button"
                    class={`segmented-btn${language === 'ru' ? ' is-active' : ''}`}
                    onClick={() => setLanguage('ru')}
                  >
                    Русский
                  </button>
                  <button
                    type="button"
                    class={`segmented-btn${language === 'tg' ? ' is-active' : ''}`}
                    onClick={() => setLanguage('tg')}
                  >
                    Тоҷикӣ
                  </button>
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <strong>Частота обновления</strong>
                  <small>Период опроса официальных API</small>
                </div>
                <div class="segmented-control">
                  <button
                    type="button"
                    class={`segmented-btn${refreshInterval === 60000 ? ' is-active' : ''}`}
                    onClick={() => setRefreshInterval(60000)}
                  >
                    1 мин
                  </button>
                  <button
                    type="button"
                    class={`segmented-btn${refreshInterval === 300000 ? ' is-active' : ''}`}
                    onClick={() => setRefreshInterval(300000)}
                  >
                    5 мин
                  </button>
                  <button
                    type="button"
                    class={`segmented-btn${refreshInterval === 900000 ? ' is-active' : ''}`}
                    onClick={() => setRefreshInterval(900000)}
                  >
                    15 мин
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Alert Mode Restriction PUSH Toast */}
      {isAlertToastOpen && (
        <aside
          class={`alert-toast-banner${isAlertToastClosing ? ' is-closing' : ''}`}
          role="alert"
          aria-live="assertive"
        >
          <div class="alert-toast-icon">
            <AlertTriangleIcon size={18} />
          </div>
          <div class="alert-toast-body">
            <strong class="alert-toast-title">Выбор других регионов заблокирован</strong>
            <p class="alert-toast-text">
              Чтобы просмотреть все локации, отключите режим тревоги.
            </p>
          </div>
          <div class="alert-toast-actions">
            <button
              type="button"
              class="alert-toast-btn"
              onClick={disableAlertMode}
            >
              Отключить
            </button>
            <button
              type="button"
              class="alert-toast-close"
              onClick={() => dismissAlertToast()}
              aria-label="Закрыть уведомление"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

