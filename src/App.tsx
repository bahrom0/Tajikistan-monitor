import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MarkdownContent, type CitationSource } from './components/MarkdownContent';
import { TajikistanMap, type GeographyFilter, type LocationSummarySelection, type PlaceResearchSelection } from './components/TajikistanMap';
import type { NewsItem, SourceStatus } from './types';

const formatTime = (date: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(date));
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

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const [newsResponse, statusResponse] = await Promise.all([fetch(`/api/news${refresh ? '?refresh=1' : ''}`), fetch('/api/status')]);
      const newsData = await newsResponse.json(); const statusData = await statusResponse.json();
      setNews(newsData.items || []); setStatuses(statusData.sources || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 300000); return () => clearInterval(timer); }, []);
  useEffect(() => () => aiRequest.current?.abort(), []);

  const categories = useMemo(() => ['Все', ...new Set(news.map((item) => item.category))], [news]);
  const filtered = news.filter((item) => {
    const matchesGeography = geographyFilter.districtId !== 'all'
      ? (item.locations ?? []).some((location) => location.locationId === geographyFilter.districtId || location.districtId === geographyFilter.districtId)
      : geographyFilter.regionId === 'all' || (item.locations ?? []).some((location) => location.locationId === geographyFilter.regionId || location.regionId === geographyFilter.regionId);
    return matchesGeography && (category === 'Все' || item.category === category) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase());
  });
  const online = statuses.filter((source) => source.status === 'online').length;

  const streamAi = async (path: string, body: unknown, fallbackError: string) => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAsking(true); setAnswer('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
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
      if (tail) { received = true; setAnswer((current) => current + tail); }
      if (!received) setAnswer('Ответ не получен.');
    } catch (error) {
      if (!controller.signal.aborted) setAnswer(error instanceof Error ? error.message : fallbackError);
    } finally {
      if (aiRequest.current === controller) { aiRequest.current = null; setAsking(false); }
    }
  };

  const askAi = async () => {
    if (!selected) return;
    await streamAi('/api/ai/explain', selected, 'Сервис объяснений сейчас недоступен.');
  };

  const streamPlaceResearch = async (selection: PlaceResearchSelection) => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAsking(true); setAnswer(''); setResearchStages([]); setResearchSources([]);
    const acceptEvent = (event: ResearchEvent) => {
      if (event.type === 'status') {
        setResearchStages((current) => {
          const previous = current.map((stage) => ({ ...stage, state: stage.state === 'error' ? 'error' as const : 'done' as const }));
          const existing = previous.findIndex((stage) => stage.id === event.id);
          const next = { id: event.id, label: event.label, state: 'active' as const };
          if (existing >= 0) return previous.map((stage, index) => index === existing ? next : stage);
          return [...previous, next];
        });
      } else if (event.type === 'sources') {
        setResearchSources(event.items);
      } else if (event.type === 'token') {
        setAnswer((current) => current + event.value);
      } else if (event.type === 'error') {
        setResearchStages((current) => [...current.map((stage) => ({ ...stage, state: 'done' as const })), { id: 'error', label: event.message, state: 'error' }]);
      } else if (event.type === 'done') {
        setResearchStages((current) => current.map((stage) => ({ ...stage, state: stage.state === 'error' ? 'error' as const : 'done' as const })));
      }
    };
    try {
      const response = await fetch('/api/ai/place-research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selection.locationId, periodDays: selection.periodDays }), signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
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
      if (!controller.signal.aborted) acceptEvent({ type: 'error', message: error instanceof Error ? error.message : 'Сервис исследования места недоступен.' });
    } finally {
      if (aiRequest.current === controller) { aiRequest.current = null; setAsking(false); }
    }
  };

  const openLocationSummary = (selection: LocationSummarySelection) => {
    setSelected(null);
    setPlaceResearch(null);
    setLocationSummary(selection);
    void streamAi('/api/ai/location-summary', {
      locationId: selection.locationId,
      locationNameRu: selection.nameRu,
      locationNameTg: selection.nameTg,
      articles: selection.articles.map(({ title, description, sourceName, publishedAt, category, severity, url }) => ({ title, description, sourceName, publishedAt, category, severity, url })),
    }, 'Сервис сумари сейчас недоступен.');
  };

  const openPlaceResearch = (selection: PlaceResearchSelection) => {
    setSelected(null);
    setLocationSummary(null);
    setPlaceResearch(selection);
    void streamPlaceResearch(selection);
  };

  const closeAi = () => { aiRequest.current?.abort(); setSelected(null); setLocationSummary(null); setPlaceResearch(null); setAnswer(''); setResearchStages([]); setResearchSources([]); setAsking(false); };

  return <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">TJ</span><div><strong>TAJIKISTAN MONITOR</strong><small>Национальная информационная панель</small></div></div>
      <div class="header-stats"><span><i class="live-dot" /> СИСТЕМА АКТИВНА</span><span>ИСТОЧНИКИ <b>{online}/{statuses.length || 3}</b></span><span>ОБНОВЛЕНИЕ <b>5 МИН</b></span></div>
      <button class="refresh" onClick={() => void load(true)} disabled={loading}>{loading ? 'ОБНОВЛЕНИЕ…' : '↻ ОБНОВИТЬ'}</button>
    </header>

    <main class="dashboard">
      <aside class="left-panel panel">
        <div class="panel-title"><span>СТАТУС ИСТОЧНИКОВ</span><b>{online} ONLINE</b></div>
        <div class="status-list">
          {(statuses.length ? statuses : [{ id:'loading', name:'Подключение к API', status:'offline', count:0, checkedAt:'' } as SourceStatus]).map((source) =>
            <div class="source-row" key={source.id}><i class={source.status} /><div><strong>{source.name}</strong><small>{source.status === 'online' ? `${source.count} записей` : source.status === 'degraded' ? 'изменилась разметка' : 'ожидание ответа'}</small></div><span>{source.status === 'online' ? 'OK' : source.status === 'degraded' ? 'WARN' : '—'}</span></div>)}
        </div>
        <div class="section-label">ОБЗОР</div>
        <div class="metric-grid"><div><small>НОВОСТЕЙ</small><b>{news.length}</b></div><div><small>ТРЕВОГ</small><b class="warn">{news.filter(n => n.severity === 'alert').length}</b></div><div><small>ГОРОДОВ</small><b>18</b></div><div><small>РАЙОНОВ</small><b>47</b></div></div>
        <div class="section-label">ЛЕГЕНДА КАРТЫ</div>
        <div class="legend"><span><i class="legend-region" /> Область</span><span><i class="legend-district" /> Район</span><span><i class="legend-city" /> Город</span><span><i class="legend-capital" /> Столица</span><span><i class="legend-border" /> Граница страны</span></div>
        <div class="system-note"><strong>ТОЛЬКО ТАДЖИКИСТАН</strong><p>Глобальные военные, финансовые, авиационные и рекламные блоки удалены.</p></div>
      </aside>

      <section class="map-stage">
        <TajikistanMap news={filtered} onGeographyFilterChange={setGeographyFilter} onLocationSummary={openLocationSummary} onPlaceResearch={openPlaceResearch} />
        <div class="map-heading"><span>ОПЕРАТИВНАЯ КАРТА</span><h1>РЕСПУБЛИКА ТАДЖИКИСТАН</h1></div>
        <div class="map-badge">38.8610° N&nbsp;&nbsp; 71.2761° E</div>
      </section>

      <aside class="news-panel panel">
        <div class="panel-title"><span>ПОСЛЕДНИЕ НОВОСТИ</span><b>{filtered.length}</b></div>
        <div class="search"><span>⌕</span><input value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Поиск по новостям…" /></div>
        <div class="filters">{categories.map((item) => <button class={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div class="news-list">
          {loading && !news.length ? <div class="empty">Загрузка официальных источников…</div> : filtered.map((item) =>
            <article class={`news-card ${item.severity}`} key={item.id} onClick={() => { aiRequest.current?.abort(); setSelected(item); setAnswer(''); setAsking(false); }}>
              <div class="news-meta"><span>{item.sourceName}</span><time>{formatTime(item.publishedAt)}</time></div>
              <h2>{item.title}</h2>{item.description && <p>{item.description}</p>}
              <div class="news-footer"><span class="category">{item.category}</span><button>ИИ-ОБЗОР →</button></div>
            </article>)}
          {!loading && !filtered.length && <div class="empty">По выбранным фильтрам новостей нет.</div>}
        </div>
      </aside>
    </main>

    {(selected || locationSummary || placeResearch) && <div class="modal-backdrop" onClick={closeAi}><section class="ai-modal" onClick={(event) => event.stopPropagation()}>
      <button class="close" onClick={closeAi}>×</button><div class="ai-label">{placeResearch ? 'AI PLACE RESEARCH' : locationSummary ? 'AI LOCATION SUMMARY' : 'AI NEWS EXPLAINER'}</div>
      <h2>{placeResearch ? `Исследование: ${placeResearch.nameRu}` : locationSummary ? `Сумари: ${locationSummary.nameRu}` : selected?.title}</h2>
      <p class="original">{placeResearch ? `${placeResearch.nameTg} · ${placeResearch.parentLabel} · период ${placeResearch.periodDays} дней` : locationSummary ? `${locationSummary.articles.length} публикаций${locationSummary.nameTg ? ` · ${locationSummary.nameTg}` : ''}` : selected?.description || 'Описание отсутствует в RSS.'}</p>
      {!locationSummary && !placeResearch && !answer && <button class="ai-button" onClick={() => void askAi()} disabled={asking}>{asking ? 'АНАЛИЗИРУЮ…' : 'ОБЪЯСНИТЬ ПРОСТЫМИ СЛОВАМИ'}</button>}
      {locationSummary && asking && !answer && <div class="ai-stream-status" role="status">СОБИРАЮ СУМАРИ ИЗ НОВОСТЕЙ…</div>}
      {placeResearch && <div class="research-trace" aria-live="polite" aria-label="Ход веб-исследования">
        <div class="research-trace-title"><span>EXA LIVE RESEARCH</span><b>{asking ? 'В ПРОЦЕССЕ' : researchStages.some((stage) => stage.state === 'error') ? 'ОШИБКА' : 'ГОТОВО'}</b></div>
        <ol class="research-steps">{researchStages.map((stage) => <li class={stage.state} key={stage.id}><i aria-hidden="true" /><span>{stage.label}</span></li>)}</ol>
        {!!researchSources.some((source) => source.type === 'requested_web') && <div class="research-sources"><div class="research-sources-label">ПОСЕЩЁННЫЕ САЙТЫ · {researchSources.filter((source) => source.type === 'requested_web').length}</div><div class="research-source-icons">
          {researchSources.filter((source) => source.type === 'requested_web').map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" title={source.title} aria-label={`Открыть источник ${source.title}`}>
            <span class="research-favicon"><b aria-hidden="true">{source.domain.slice(0, 1).toUpperCase()}</b>{source.favicon && <img src={source.favicon} alt="" width="22" height="22" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</span>
            <span class="research-source-copy"><strong>{source.title}</strong><small>{source.domain}</small></span>
          </a>)}
        </div></div>}
      </div>}
      {answer && <div class="ai-answer" aria-live="polite"><div class="ai-answer-title">{placeResearch ? 'Ответ исследователя' : locationSummary ? 'Сумари новостей' : 'Понятное объяснение'}</div><MarkdownContent content={answer} sources={placeResearch ? researchSources : []} /></div>}
      {selected?.url && <a href={selected.url} target="_blank" rel="noreferrer">Открыть официальный источник ↗</a>}
    </section></div>}
  </div>;
}
