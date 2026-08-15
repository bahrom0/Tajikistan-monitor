import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MarkdownContent } from './components/MarkdownContent';
import { TajikistanMap, type GeographyFilter } from './components/TajikistanMap';
import type { NewsItem, SourceStatus } from './types';

const formatTime = (date: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(date));

export function App() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [category, setCategory] = useState('Все');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
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

  const askAi = async () => {
    if (!selected) return;
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAsking(true); setAnswer('');
    try {
      const response = await fetch('/api/ai/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selected), signal: controller.signal });
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
      if (!controller.signal.aborted) setAnswer(error instanceof Error ? error.message : 'Сервис объяснений сейчас недоступен.');
    } finally {
      if (aiRequest.current === controller) { aiRequest.current = null; setAsking(false); }
    }
  };

  const closeAi = () => { aiRequest.current?.abort(); setSelected(null); setAsking(false); };

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
        <div class="metric-grid"><div><small>НОВОСТЕЙ</small><b>{news.length}</b></div><div><small>ТРЕВОГ</small><b class="warn">{news.filter(n => n.severity === 'alert').length}</b></div><div><small>ГОРОДОВ</small><b>16</b></div><div><small>РЕГИОНОВ</small><b>5</b></div></div>
        <div class="section-label">ЛЕГЕНДА КАРТЫ</div>
        <div class="legend"><span><i class="legend-city" /> Город</span><span><i class="legend-capital" /> Столица</span><span><i class="legend-border" /> Граница страны</span></div>
        <div class="system-note"><strong>ТОЛЬКО ТАДЖИКИСТАН</strong><p>Глобальные военные, финансовые, авиационные и рекламные блоки удалены.</p></div>
      </aside>

      <section class="map-stage">
        <TajikistanMap news={filtered} onGeographyFilterChange={setGeographyFilter} />
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

    {selected && <div class="modal-backdrop" onClick={closeAi}><section class="ai-modal" onClick={(event) => event.stopPropagation()}>
      <button class="close" onClick={closeAi}>×</button><div class="ai-label">AI NEWS EXPLAINER</div><h2>{selected.title}</h2><p class="original">{selected.description || 'Описание отсутствует в RSS.'}</p>
      {!answer && <button class="ai-button" onClick={() => void askAi()} disabled={asking}>{asking ? 'АНАЛИЗИРУЮ…' : 'ОБЪЯСНИТЬ ПРОСТЫМИ СЛОВАМИ'}</button>}
      {answer && <div class="ai-answer" aria-live="polite"><div class="ai-answer-title">Понятное объяснение</div><MarkdownContent content={answer} /></div>}
      {selected.url && <a href={selected.url} target="_blank" rel="noreferrer">Открыть официальный источник ↗</a>}
    </section></div>}
  </div>;
}
