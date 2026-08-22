import { searchPlaceWithExa, canonicalPlaceContext, relatedLocationNews, researchSourceItems } from './place-research.mjs';

export const CHAT_TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_news',
      description: 'Поиск проверенных официальных публикаций и новостей Таджикистана по ключевым словам, локации, категории или уровню важности.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос (например "авария", "строительство", "визит", "паводок")' },
          location_id: { type: 'string', description: 'ID или название локации (например "khujand", "dushanbe", "khorugh")' },
          category: { type: 'string', description: 'Категория (например "Безопасность", "Экономика", "Погода", "Общество", "Политика")' },
          limit: { type: 'number', description: 'Максимальное количество результатов (от 1 до 10, по умолчанию 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_news',
      description: 'Получить последние оперативные новости из официальных источников Таджикистана (Ховар, КЧС, Метео, НБТ и др.).',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Опциональный фильтр по категории' },
          limit: { type: 'number', description: 'Количество последних новостей (от 1 до 10, по умолчанию 6)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_location_info',
      description: 'Получить точные канонические географические и административные данные по городу, району или области Таджикистана (названия на русском и таджикском, принадлежность к региону/району, координаты, тип).',
      parameters: {
        type: 'object',
        properties: {
          location_query: { type: 'string', description: 'Название или ID населённого пункта или района (например "Душанбе", "Пенджикент", "ГБАО", "Хатлон")' },
        },
        required: ['location_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather_and_rates',
      description: 'Получить актуальные курсы валют Национального банка Таджикистана (НБТ) и текущие метеосводки/предупреждения Гидромета.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['all', 'weather_only', 'rates_only'], description: 'Тип запрашиваемых данных' },
        },
      },
    },
  },
    {
      type: 'function',
      function: {
        name: 'research_place',
        description: 'Провести глубокое веб-исследование событий и публикаций по конкретной территории Таджикистана за период 7, 30 или 90 дней через Exa Search и официальные архивы.',
        parameters: {
          type: 'object',
          properties: {
            location_id: { type: 'string', description: 'Канонический ID или название локации (например "city-dushanbe", "city-khujand", "Худжанд")' },
            period_days: { type: 'number', enum: [7, 30, 90, 365], description: 'Период поиска в днях (по умолчанию 30)' },
          },
          required: ['location_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_web_exa',
        description: 'Живой поиск актуальной информации в Интернете через нейропоиск Exa AI по любой теме (события, аналитика, проверка фактов, контекст по Таджикистану и миру).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Поисковый запрос на русском, таджикском или английском' },
            num_results: { type: 'number', description: 'Количество результатов (от 1 до 8, по умолчанию 5)' },
          },
          required: ['query'],
        },
      },
    },
  ];

export function articleToSource(item, index) {
  let domain = 'Факты';
  let favicon = '';
  try {
    if (item.url && item.url.startsWith('http')) {
      const parsed = new URL(item.url);
      domain = parsed.hostname.replace(/^www\./, '');
      favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    }
  } catch {}
  return {
    id: `N${index + 1}`,
    type: 'official_news',
    title: item.title || 'Новость',
    url: item.url || '',
    domain: item.sourceName || domain,
    favicon,
    publishedDate: item.publishedAt || new Date().toISOString(),
  };
}

export async function executeChatTool(toolName, args, context) {
  const { loadNews, locationsById, locationDataset, aliasDataset } = context;

  if (toolName === 'search_news') {
    const data = await loadNews();
    const query = String(args.query || '').toLowerCase().trim();
    const locationQuery = String(args.location_id || '').toLowerCase().trim();
    const category = String(args.category || '').toLowerCase().trim();
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);

    const filtered = (data.items || []).filter((item) => {
      const textMatch = !query || `${item.title} ${item.description}`.toLowerCase().includes(query);
      const catMatch = !category || (item.category || '').toLowerCase().includes(category);
      const locMatch = !locationQuery || (item.locations || []).some((loc) =>
        loc.locationId?.toLowerCase().includes(locationQuery) ||
        loc.nameRu?.toLowerCase().includes(locationQuery) ||
        loc.nameTg?.toLowerCase().includes(locationQuery)
      );
      return textMatch && catMatch && locMatch;
    }).slice(0, limit);

    const sources = filtered.map((item, idx) => articleToSource(item, idx));
    const results = filtered.map((item, idx) => ({
      citation_id: `[N${idx + 1}]`,
      title: item.title,
      description: item.description,
      source: item.sourceName,
      date: item.publishedAt,
      category: item.category,
      severity: item.severity,
      locations: item.locations?.map((l) => l.nameRu).join(', ') || 'Таджикистан',
      url: item.url,
    }));

    return {
      success: true,
      found_count: results.length,
      articles: results,
      sources,
      summary: results.length > 0 ? `Найдено ${results.length} публикаций по запросу "${args.query}"` : `Публикаций по запросу "${args.query}" не найдено.`,
    };
  }

  if (toolName === 'get_recent_news') {
    const data = await loadNews();
    const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 10);
    const category = String(args.category || '').toLowerCase().trim();

    const filtered = (data.items || []).filter((item) => {
      return !category || (item.category || '').toLowerCase().includes(category);
    }).slice(0, limit);

    const sources = filtered.map((item, idx) => articleToSource(item, idx));
    const results = filtered.map((item, idx) => ({
      citation_id: `[N${idx + 1}]`,
      title: item.title,
      description: item.description,
      source: item.sourceName,
      date: item.publishedAt,
      category: item.category,
      severity: item.severity,
      url: item.url,
    }));

    return {
      success: true,
      articles: results,
      sources,
      summary: `Получено ${results.length} последних официальных новостей.`,
    };
  }

  if (toolName === 'get_location_info') {
    const q = String(args.location_query || '').toLowerCase().trim();
    if (!q) return { success: false, error: 'Укажите название локации.' };

    const locList = locationDataset?.locations || [];
    let match = locList.find((loc) => loc.id.toLowerCase() === q);
    if (!match) {
      match = locList.find((loc) =>
        loc.name_ru?.toLowerCase() === q ||
        loc.name_tg?.toLowerCase() === q
      );
    }
    if (!match) {
      match = locList.find((loc) =>
        loc.name_ru?.toLowerCase().includes(q) ||
        loc.name_tg?.toLowerCase().includes(q)
      );
    }

    if (!match) {
      return { success: false, message: `Локация "${args.location_query}" не найдена в каноническом классификаторе Таджикистана.` };
    }

    const place = canonicalPlaceContext(match, locationsById);
    return {
      success: true,
      location: {
        id: match.id,
        name_ru: match.name_ru,
        name_tg: match.name_tg,
        type: match.type,
        region_id: match.region_id,
        parent_label: place.parentLabel,
        coordinates: { longitude: match.longitude, latitude: match.latitude },
        osm_id: match.osm_id,
      },
      sources: [],
      summary: `Локация: ${match.name_ru} (${match.name_tg}), тип: ${match.type}, регион/район: ${place.parentLabel}`,
    };
  }

  if (toolName === 'get_weather_and_rates') {
    const data = await loadNews();
    const reqType = args.type || 'all';

    const output = {};
    if (reqType === 'all' || reqType === 'rates_only') {
      output.exchange_rates = {
        base: 'TJS (Таджикский сомони)',
        rates: (data.rates || []).slice(0, 10).map((r) => ({
          currency: r.code,
          name: r.nameRu,
          rate_to_tjs: r.rateTjs,
          unit: r.unit,
          date: r.effectiveAt,
        })),
      };
    }
    if (reqType === 'all' || reqType === 'weather_only') {
      output.weather = {
        alerts: (data.weather?.alerts || []).slice(0, 5),
        forecasts: (data.weather?.forecasts || []).slice(0, 8),
      };
    }

    return {
      success: true,
      data: output,
      sources: [
        {
          id: 'N1',
          type: 'official_news',
          title: 'Национальный банк Таджикистана (НБТ)',
          url: 'https://nbt.tj/ru/news/',
          domain: 'nbt.tj',
          favicon: 'https://www.google.com/s2/favicons?domain=nbt.tj&sz=32',
          publishedDate: new Date().toISOString(),
        },
        {
          id: 'N2',
          type: 'official_news',
          title: 'Агентство по гидрометеорологии РТ',
          url: 'https://meteo.tj/ru',
          domain: 'meteo.tj',
          favicon: 'https://www.google.com/s2/favicons?domain=meteo.tj&sz=32',
          publishedDate: new Date().toISOString(),
        },
      ],
      summary: 'Получены официальные курсы валют НБТ и метеосводки.',
    };
  }

  if (toolName === 'research_place') {
    const locationQuery = String(args.location_id || args.location_query || '').trim();
    const normalizedQuery = locationQuery.toLocaleLowerCase('ru-RU');
    const locationList = locationDataset?.locations || [];
    const commonSlugAliases = new Map([
      ['khudzhand', 'city-khujand'],
      ['hujand', 'city-khujand'],
      ['khodjent', 'city-khujand'],
    ]);
    const candidateIds = [
      locationQuery,
      commonSlugAliases.get(normalizedQuery),
      `city-${normalizedQuery}`,
      `region-${normalizedQuery}`,
      `district-${normalizedQuery}`,
      `settlement-${normalizedQuery}`,
    ].filter(Boolean);
    let location = candidateIds.map((id) => locationsById.get(id)).find(Boolean);
    if (!location) {
      location = locationList.find((item) =>
        item.name_ru?.toLocaleLowerCase('ru-RU') === normalizedQuery ||
        item.name_tg?.toLocaleLowerCase('tg-TJ') === normalizedQuery
      );
    }
    if (!location) {
      const aliasEntry = Object.entries(aliasDataset?.aliases || {}).find(([, aliases]) =>
        aliases.some((alias) => alias.toLocaleLowerCase('ru-RU') === normalizedQuery)
      );
      if (aliasEntry) location = locationsById.get(aliasEntry[0]);
    }
    if (!location) {
      return { success: false, error: `Локация «${locationQuery}» не найдена в каноническом справочнике.` };
    }
    const periodDays = [7, 30, 90, 365].includes(Number(args.period_days)) ? Number(args.period_days) : 30;
    const data = await loadNews();
    const place = canonicalPlaceContext(location, locationsById);
    const relatedNews = relatedLocationNews(data.items || [], location, locationsById);

    let webSearch = { results: [] };
    try {
      webSearch = await searchPlaceWithExa(location, periodDays);
    } catch (e) {
      // If Exa is not configured or failed, fallback to canonical news
    }

    const sources = researchSourceItems(relatedNews, webSearch);
    return {
      success: true,
      place,
      news_count: relatedNews.length,
      web_results_count: webSearch.results.length,
      recent_news: relatedNews.slice(0, 5).map((n) => ({ title: n.title, description: n.description, url: n.url })),
      web_results: webSearch.results.slice(0, 5).map((w) => ({ title: w.title, snippet: w.text?.slice(0, 300), url: w.url })),
      sources,
      summary: `Собраны материалы по ${place.nameRu}: ${relatedNews.length} официальных новостей, ${webSearch.results.length} внешних источников.`,
    };
  }

  if (toolName === 'search_web_exa') {
    const q = String(args.query || '').trim();
    if (!q) return { success: false, error: 'Укажите поисковый запрос.' };
    const numResults = Math.min(Math.max(Number(args.num_results) || 5, 1), 8);
    const apiKey = process.env.EXA_API_KEY;

    if (!apiKey) {
      const data = await loadNews();
      const queryLower = q.toLowerCase();
      const filtered = (data.items || []).filter((item) =>
        `${item.title} ${item.description}`.toLowerCase().includes(queryLower)
      ).slice(0, numResults);

      const sources = filtered.map((item, idx) => articleToSource(item, idx));
      return {
        success: true,
        query: q,
        found_count: filtered.length,
        results: filtered.map((item, idx) => ({
          citation_id: `[N${idx + 1}]`,
          title: item.title,
          snippet: item.description,
          url: item.url,
          source: item.sourceName,
        })),
        sources,
        summary: `Найдено ${filtered.length} источников (локальная база) по запросу "${q}".`,
      };
    }

    try {
      const exaRes = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: q,
          numResults,
          type: 'neural',
          contents: {
            text: { maxCharacters: 1200 },
            highlights: { numSentences: 3 },
          },
        }),
      });

      if (!exaRes.ok) {
        throw new Error(`Exa API HTTP ${exaRes.status}`);
      }

      const data = await exaRes.json();
      const rawResults = data.results || [];
      const sources = rawResults.map((r, idx) => {
        let domain = 'Веб-источник';
        let favicon = '';
        try {
          const parsed = new URL(r.url);
          domain = parsed.hostname.replace(/^www\./, '');
          favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch {}
        return {
          id: `W${idx + 1}`,
          type: 'requested_web',
          title: r.title || domain,
          url: r.url || '',
          domain,
          favicon,
          publishedDate: r.publishedDate || new Date().toISOString(),
        };
      });

      const cleanResults = rawResults.map((r, idx) => ({
        citation_id: `[W${idx + 1}]`,
        title: r.title || 'Без названия',
        url: r.url,
        snippet: (r.highlights && r.highlights[0]) || (r.text ? r.text.slice(0, 400) : ''),
        publishedDate: r.publishedDate,
      }));

      return {
        success: true,
        query: q,
        found_count: cleanResults.length,
        results: cleanResults,
        sources,
        summary: `Найдено ${cleanResults.length} веб-страниц по запросу "${q}".`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Ошибка веб-поиска Exa: ${err.message}`,
      };
    }
  }

  return { success: false, error: `Неизвестный инструмент: ${toolName}` };
}

export function getToolsForModes(modes = {}) {
  const { webSearch, dbSearch, officialStrict } = modes;

  if (officialStrict) {
    return CHAT_TOOLS_DEFINITIONS;
  }
  if (dbSearch && !webSearch) {
    return CHAT_TOOLS_DEFINITIONS.filter(
      (t) => t.function.name !== 'search_web_exa' && t.function.name !== 'research_place'
    );
  }
  if (webSearch && !dbSearch) {
    return CHAT_TOOLS_DEFINITIONS.filter(
      (t) => t.function.name === 'search_web_exa' || t.function.name === 'research_place'
    );
  }
  return CHAT_TOOLS_DEFINITIONS;
}
