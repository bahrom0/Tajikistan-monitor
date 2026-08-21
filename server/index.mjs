import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources, referenceSources } from './config/sources.mjs';
import { fetchSourceAdapter } from './adapters/index.mjs';
import { createAiGeolocationResolver, createGeolocator } from './lib/geolocate.mjs';
import { contentDelta, parseOpenAiSse, resolveChatCompletionsUrl } from './lib/openai-stream.mjs';
import { locationSummaryFallback, locationSummaryMessages, normalizeLocationSummaryRequest } from './lib/location-summary.mjs';
import { canonicalPlaceContext, normalizeResearchPeriod, placeResearchFallback, placeResearchMessages, relatedLocationNews, researchSourceItems, searchPlaceWithExa } from './lib/place-research.mjs';
import { loadSupabaseMonitorCache } from './lib/supabase-cache.mjs';
import { executeChatTool, getToolsForModes } from './lib/chat-tools.mjs';
import {
  buildToolNarration,
  reasoningEffortLabel,
  selectReasoningEffort,
} from './lib/chat-behavior.mjs';
import {
  createToolMarkupStreamFilter,
  normalizeToolArguments,
  normalizeToolName,
  parseTextToolCalls,
} from './lib/chat-tool-protocol.mjs';
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  listMessages,
  createMessage,
  updateMessage,
  deleteMessage,
  truncateMessagesAfter,
  generateConversationTitle,
  buildOptimizedContext,
} from './lib/chat-persistence.mjs';

const port = Number(process.env.PORT || 8787);
const root = fileURLToPath(new URL('../', import.meta.url));
const locationDataset = JSON.parse(await readFile(join(root, 'src/data/geography/locations.json'), 'utf8'));
const aliasDataset = JSON.parse(await readFile(join(root, 'src/data/geography/location-aliases.json'), 'utf8'));
const locationsById = new Map(locationDataset.locations.map((location) => [location.id, location]));
const geolocate = createGeolocator(locationDataset.locations, aliasDataset);
const resolveGeolocation = createAiGeolocationResolver({
  enabled: process.env.GEOLOCATION_AI_ENABLED === 'true',
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_MODEL,
});
const cache = { expiresAt: 0, items: [], statuses: [], weather: { alerts: [], forecasts: [] }, rates: [] };
const placeResearchRate = new Map();

const demoItems = [
  { id: 'demo-1', title: 'Монитор готов принимать официальные новости', description: 'После подключения к сети сервер автоматически загрузит свежие публикации выбранных ведомств.', sourceId: 'system', sourceName: 'Tajikistan Monitor', category: 'Система', publishedAt: new Date().toISOString(), severity: 'normal', url: '' },
  { id: 'demo-2', title: 'Источники ограничены территорией Таджикистана', description: 'В каркасе нет глобальных военных, биржевых, морских или рекламных модулей.', sourceId: 'system', sourceName: 'Tajikistan Monitor', category: 'Система', publishedAt: new Date(Date.now() - 300000).toISOString(), severity: 'normal', url: '' },
];

async function loadNews(force = false) {
  if (!force && cache.expiresAt > Date.now()) return cache;
  try {
    const persisted = await loadSupabaseMonitorCache();
    if (persisted) {
      const locatedItems = persisted.items.map((item) => item.locations?.length ? item : geolocate(item));
      cache.items = (await Promise.all(locatedItems.map(resolveGeolocation))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      cache.statuses = persisted.statuses;
      cache.weather = persisted.weather;
      cache.rates = persisted.rates;
      cache.expiresAt = Date.now() + 60_000;
      return cache;
    }
  } catch (error) {
    console.warn('supabase_cache_unavailable', { message: error instanceof Error ? error.message : 'unknown' });
  }
  const settled = await Promise.allSettled(sources.map(async (source) => ({ source, result: await fetchSourceAdapter(source) })));
  const items = [];
  const weather = { alerts: [], forecasts: [] };
  const rates = [];
  const statuses = settled.map((result, index) => {
    const source = sources[index];
    if (result.status === 'fulfilled') {
      const payload = result.value.result;
      items.push(...(payload.items || []));
      weather.alerts.push(...(payload.weather?.alerts || []));
      weather.forecasts.push(...(payload.weather?.forecasts || []));
      rates.push(...(payload.rates || []));
      const count = (payload.items?.length || 0) + (payload.weather?.forecasts?.length || 0) + (payload.rates?.length || 0);
      return { id: source.id, name: source.name, status: 'online', count, checkedAt: new Date().toISOString() };
    }
    const degraded = result.reason?.code === 'ADAPTER_CONTRACT';
    return { id: source.id, name: source.name, status: degraded ? 'degraded' : 'offline', count: 0, checkedAt: new Date().toISOString(), error: result.reason instanceof Error ? result.reason.message : 'Ошибка источника' };
  });
  const locatedItems = (items.length ? items : demoItems).map(geolocate);
  cache.items = (await Promise.all(locatedItems.map(resolveGeolocation))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  cache.statuses = statuses;
  cache.weather = weather;
  cache.rates = rates;
  cache.expiresAt = Date.now() + 5 * 60_000;
  return cache;
}

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readBody(req, maxBytes = 512_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Слишком большой запрос.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const writeNdjson = (res, event) => {
  if (res.writableEnded || res.destroyed) return false;
  return res.write(`${JSON.stringify(event)}\n`);
};

async function explainNews(req, res) {
  const body = await readBody(req);
  const title = String(body.title || '').slice(0, 500);
  const description = String(body.description || '').slice(0, 3000);
  const question = String(body.question || 'Объясни эту новость простыми словами').slice(0, 500);
  return streamAiResponse(res, [
    { role: 'system', content: 'Ты аналитик новостей Таджикистана. Отвечай простым русским языком, отделяй факты от предположений и не выдумывай детали. Форматируй ответ аккуратным Markdown: короткие разделы, абзацы и списки только когда они полезны.' },
    { role: 'user', content: `Заголовок: ${title}\nОписание: ${description}\nВопрос: ${question}` },
  ], `Простыми словами: «${title}». ${description || 'В публикации пока нет подробного описания.'} Для полноценного анализа добавьте OPENAI_API_KEY в .env.`);
}

async function streamAiResponse(res, messages, fallback) {
  if (!process.env.OPENAI_API_KEY) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    return res.end(fallback);
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(new Error('AI provider timeout')), 120_000);
  res.once('close', () => abortController.abort());
  let response;
  try {
    response = await fetch(resolveChatCompletionsUrl(process.env.OPENAI_BASE_URL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.2, stream: true, messages }),
      signal: abortController.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
  if (!response.ok) {
    clearTimeout(timeout);
    return json(res, 502, { error: `AI provider: HTTP ${response.status}` });
  }
  if (!response.body) {
    clearTimeout(timeout);
    return json(res, 502, { error: 'AI provider не вернул поток данных' });
  }

  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  res.flushHeaders();
  res.socket?.setNoDelay(true);

  try {
    for await (const payload of parseOpenAiSse(response.body)) {
      const token = contentDelta(payload);
      if (token && !res.write(token)) await once(res, 'drain');
    }
    res.end();
  } catch (error) {
    res.destroy(error instanceof Error ? error : new Error('AI stream failed'));
  } finally {
    clearTimeout(timeout);
  }
}

async function summarizeLocation(req, res) {
  const request = normalizeLocationSummaryRequest(await readBody(req));
  return streamAiResponse(res, locationSummaryMessages(request), locationSummaryFallback(request));
}

function allowPlaceResearch(req, locationId) {
  const key = `${String(req.socket.remoteAddress || 'local')}:${locationId}`;
  const now = Date.now();
  const recent = (placeResearchRate.get(key) ?? []).filter((time) => now - time < 10 * 60_000);
  if (recent.length >= 8) return false;
  recent.push(now);
  placeResearchRate.set(key, recent);
  return true;
}

async function researchPlace(req, res) {
  const body = await readBody(req, 16_000);
  const locationId = String(body?.locationId || '').trim().slice(0, 160);
  const location = locationsById.get(locationId);
  if (!location) return json(res, 400, { error: 'Выбранное место отсутствует в каноническом реестре.' });
  if (!allowPlaceResearch(req, locationId)) return json(res, 429, { error: 'Слишком много исследований этого места. Повторите запрос позже.' });
  const periodDays = normalizeResearchPeriod(body?.periodDays);
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache, no-store',
    'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff',
  });
  res.flushHeaders();
  res.socket?.setNoDelay(true);
  writeNdjson(res, { type: 'status', id: 'thinking', label: 'Думаю над запросом…' });
  const data = await loadNews();
  const place = canonicalPlaceContext(location, locationsById);
  const news = relatedLocationNews(data.items, location, locationsById);
  writeNdjson(res, { type: 'status', id: 'internet', label: 'Выхожу в интернет через Exa Search…' });
  writeNdjson(res, { type: 'status', id: 'search', label: `Ищу новости за ${periodDays} дней…` });
  let webSearch;
  try {
    webSearch = await searchPlaceWithExa(location, periodDays);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Exa Search недоступен.';
    console.warn('exa_place_search_failed', { locationId, message });
    writeNdjson(res, { type: 'error', message });
    writeNdjson(res, { type: 'done' });
    return res.end();
  }
  writeNdjson(res, {
    type: 'sources',
    items: researchSourceItems(news, webSearch),
  });
  writeNdjson(res, { type: 'status', id: 'collecting', label: `Собираю информацию из ${webSearch.results.length} сайтов…` });
  const research = { place, news, webSearch };
  writeNdjson(res, { type: 'status', id: 'summary', label: 'Делаю суммари и проверяю ссылки…' });

  // Stream answer
  const messages = placeResearchMessages(research);
  const fallback = placeResearchFallback(research);

  if (!process.env.OPENAI_API_KEY) {
    writeNdjson(res, { type: 'token', value: fallback });
    writeNdjson(res, { type: 'done' });
    return res.end();
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(new Error('AI provider timeout')), 120_000);
  res.once('close', () => abortController.abort());
  try {
    const response = await fetch(resolveChatCompletionsUrl(process.env.OPENAI_BASE_URL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.2, stream: true, messages }),
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(`AI provider: HTTP ${response.status}`);
    if (!response.body) throw new Error('AI provider не вернул поток данных');
    for await (const payload of parseOpenAiSse(response.body)) {
      const token = contentDelta(payload);
      if (token && !writeNdjson(res, { type: 'token', value: token })) await once(res, 'drain');
    }
    writeNdjson(res, { type: 'done' });
    res.end();
  } catch (error) {
    if (!res.destroyed) {
      writeNdjson(res, { type: 'error', message: error instanceof Error ? error.message : 'AI stream failed' });
      writeNdjson(res, { type: 'done' });
      res.end();
    }
  } finally {
    clearTimeout(timeout);
  }
}

// --------------------------------------------------------------------------
// AI CHAT STREAMING & PERSISTENCE ENGINE
// --------------------------------------------------------------------------

function createThinkStreamParser({ onToken, onThinkToken, onThinkStart }) {
  let inThink = false;
  let buffer = '';

  return {
    feed(chunk) {
      buffer += chunk;

      while (buffer.length > 0) {
        if (!inThink) {
          const openIdx = buffer.indexOf('<think>');
          if (openIdx !== -1) {
            const before = buffer.slice(0, openIdx);
            if (before) onToken(before);
            inThink = true;
            onThinkStart();
            buffer = buffer.slice(openIdx + 7);
          } else {
            let partialLen = 0;
            for (let len = 1; len < 7 && len <= buffer.length; len++) {
              const suffix = buffer.slice(-len);
              if ('<think>'.startsWith(suffix)) {
                partialLen = len;
              }
            }

            if (partialLen > 0) {
              const safe = buffer.slice(0, buffer.length - partialLen);
              if (safe) onToken(safe);
              buffer = buffer.slice(buffer.length - partialLen);
              break;
            } else {
              onToken(buffer);
              buffer = '';
            }
          }
        } else {
          const closeIdx = buffer.indexOf('</think>');
          if (closeIdx !== -1) {
            const thinkText = buffer.slice(0, closeIdx);
            if (thinkText) onThinkToken(thinkText);
            inThink = false;
            buffer = buffer.slice(closeIdx + 8);
          } else {
            let partialLen = 0;
            for (let len = 1; len < 8 && len <= buffer.length; len++) {
              const suffix = buffer.slice(-len);
              if ('</think>'.startsWith(suffix)) {
                partialLen = len;
              }
            }

            if (partialLen > 0) {
              const safe = buffer.slice(0, buffer.length - partialLen);
              if (safe) onThinkToken(safe);
              buffer = buffer.slice(buffer.length - partialLen);
              break;
            } else {
              onThinkToken(buffer);
              buffer = '';
            }
          }
        }
      }
    },
    flush() {
      if (buffer.length > 0) {
        if (inThink) {
          onThinkToken(buffer);
        } else {
          onToken(buffer);
        }
        buffer = '';
      }
    },
  };
}

function sanitizeThinkTags(rawContent, rawThinking) {
  let content = rawContent || '';
  let thinking = rawThinking || '';

  if (content.includes('<think>')) {
    content = content.replace(/<think>([\s\S]*?)<\/think>/gi, (_, thoughts) => {
      thinking = (thinking ? `${thinking}\n` : '') + thoughts.trim();
      return '';
    });
    content = content.replace(/<think>([\s\S]*)$/gi, (_, thoughts) => {
      thinking = (thinking ? `${thinking}\n` : '') + thoughts.trim();
      return '';
    });
  }

  // Strip any remaining DSML or tool call tags
  content = content
    .replace(/<[\s|/]*DSML[\s|/]*toolcalls>[\s\S]*?<[\s|/]*DSML[\s|/]*toolcalls>/gi, '')
    .replace(/<[\s|/]*DSML[\s\S]*?>/gi, '')
    .replace(/<[｜|][\s\S]*?[｜|]>/gi, '')
    .replace(/<\/?(?:tool_call|function_call|invoke|parameter)[^>]*>/gi, '')
    .replace(/<\/think>/gi, '')
    .trim();

  return {
    content: content || 'Ответ сформирован.',
    thinking: thinking.trim() || undefined,
  };
}

function buildSystemPromptChat(modes = {}, language = 'ru', reasoningEffort = 'medium') {
  let prompt = `Ты — ведущий национальный интеллектуальный ассистент и аналитик платформы мониторинга Таджикистана (Tajikistan Monitor).
Ты предоставляешь точные, проверенные и емкие ответы по новостям, событиям, административно-территориальному устройству, погоде, курсам валют Национального банка и обстановке в регионах Таджикистана.

Базовые правила:
1. Будь точным, вежливым и объективным. Всегда отделяй факты от слухов и предположений.
2. Когда вопрос касается свежих новостей, конкретного города/района, погоды, курсов валют или оперативных событий, ОБЯЗАТЕЛЬНО используй соответствующие инструменты.
3. Ответ структурируй профессиональным, богатым Markdown: используй четкие заголовки (#, ##, ###), маркированные и нумерованные списки, таблицы (для курсов или статистики), цитаты (>), чекбоксы (- [x]) и ссылки.
4. При ссылке на найденные новости используй маркеры [N1], [N2] или [W1], [W2].
5. Отвечай на языке запроса пользователя (${language === 'tg' ? 'таджикский (тоҷикӣ)' : 'русский'}).
6. Перед вызовом инструмента дай пользователю одно короткое понятное предложение о следующем действии. Между дополнительными поисками кратко объясняй, что именно уточняешь.
7. Не раскрывай скрытую цепочку рассуждений и не печатай служебную разметку, XML, DSML или JSON вызова инструмента.
8. Автоматически выбранная глубина работы: ${reasoningEffort}. Для high тщательно сопоставляй источники; для low отвечай быстро и без лишних этапов.`;

  if (modes.officialStrict) {
    prompt += `\n\nРЕЖИМ СТРОГОЙ ОФИЦИАЛЬНОЙ ВЕРИФИКАЦИИ:
Ты выступаешь в роли строгого фактчекера. Проверяй информацию по официальным государственным реестрам и проверенным источникам Таджикистана (НИАТ Ховар, КЧС, министерства, НБТ, Агентство по статистике, Гидромет).
- Если новость или факт не имеют официального подтверждения, прямо предупреди пользователя об этом.
- Выявляй возможные фейки или неточности в вопросе.`;
  }

  if (modes.webSearch) {
    prompt += `\n\nРЕЖИМ ВЕБ-ПОИСКА:
Тебе доступен инструмент живого нейропоиска search_web_exa для актуализации сведений из интернета. Используй его для поиска свежих внешних публикаций и контекста.`;
  }

  if (modes.dbSearch) {
    prompt += `\n\nРЕЖИМ ПОИСКА ПО БАЗЕ:
Сконцентрируйся на внутренней базе данных проекта (search_news, get_recent_news, get_location_info, get_weather_and_rates).`;
  }

  return prompt;
}

async function handleStreamChat(req, res) {
  const sessionId = String(req.headers['x-session-id'] || 'default-session').slice(0, 128);
  const userId = req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null;

  const body = await readBody(req, 128_000);
  let conversationId = body.conversationId ? String(body.conversationId) : null;
  const userPrompt = String(body.message || '').trim();
  const enableTools = body.toolsEnabled !== false;
  const requestedModes = body.modes || {};
  const modes = {
    webSearch: requestedModes.webSearch === true,
    dbSearch: requestedModes.dbSearch !== false,
    officialStrict: requestedModes.officialStrict === true,
  };
  const language = body.language === 'tg' ? 'tg' : 'ru';
  const reasoningEffort = selectReasoningEffort(userPrompt, modes);

  // Prepare conversation
  let conv = conversationId ? await getConversation(conversationId, { sessionId, userId }) : null;
  let isNewConv = false;

  if (!conv) {
    conv = await createConversation({
      sessionId,
      userId,
      title: userPrompt ? userPrompt.slice(0, 45) : 'Новый разговор',
      metadata: { modes },
    });
    conversationId = conv.id;
    isNewConv = true;
  }

  // Save user message if provided
  let userMessage = null;
  if (userPrompt) {
    userMessage = await createMessage({
      conversationId,
      role: 'user',
      content: userPrompt,
    });
  }

  // Headers for streaming ndjson
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  res.flushHeaders();
  res.socket?.setNoDelay(true);

  if (isNewConv) {
    writeNdjson(res, { type: 'conversation_created', conversation: conv });
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(new Error('Chat stream timeout')), 180_000);
  res.once('close', () => abortController.abort());

  const context = {
    loadNews,
    locationsById,
    locationDataset,
    aliasDataset,
  };

  const accumulatedSources = [];
  const accumulatedToolCalls = [];
  const accumulatedAgentSteps = [];
  const timeline = [];
  let assistantContent = '';
  let assistantThinking = '';

  const emitAssistantToken = (value) => {
    if (!value) return;
    assistantContent += value;
    const lastItem = timeline[timeline.length - 1];
    if (lastItem?.type === 'assistant') {
      lastItem.content += value;
    } else {
      timeline.push({ type: 'assistant', id: `text_${timeline.length}`, content: value });
    }
    if (!writeNdjson(res, { type: 'token', value })) {
      void once(res, 'drain');
    }
  };

  const startTimelineTool = (toolCall) => {
    timeline.push({ type: 'tool', id: toolCall.id, toolCall });
  };

  const finishTimelineTool = (id, state, resultSummary) => {
    const item = timeline.find((entry) => entry.type === 'tool' && entry.id === id);
    if (item) {
      item.toolCall = { ...item.toolCall, state, resultSummary };
    }
  };

  const emitActivity = (step) => {
    const existing = timeline.find((entry) => entry.type === 'activity' && entry.id === step.id);
    if (existing) {
      existing.step = step;
    } else {
      timeline.push({ type: 'activity', id: step.id, step });
    }
    const stepIndex = accumulatedAgentSteps.findIndex((entry) => entry.id === step.id);
    if (stepIndex >= 0) accumulatedAgentSteps[stepIndex] = step;
    else accumulatedAgentSteps.push(step);
    writeNdjson(res, { type: 'activity', step });
  };

  try {
    const activeTools = getToolsForModes(modes);
    const systemPrompt = buildSystemPromptChat(modes, language, reasoningEffort);

    // Load past messages for context
    const allMessages = await listMessages(conversationId);
    const messagesContext = buildOptimizedContext(
      systemPrompt,
      allMessages.filter((m) => m.id !== userMessage?.id),
      userPrompt,
      10
    );

    // If no OpenAI API key is set, produce smart fallback answer using tools directly
    if (!process.env.OPENAI_API_KEY) {
      let fallbackAnswer = '';
      const promptLower = userPrompt.toLowerCase();

      // Emit initial agent search step
      const step1 = {
        id: `step_${Date.now()}_1`,
        stage: 'search',
        label: modes.webSearch ? 'Поиск в сети Exa...' : 'Поиск в официальной базе данных...',
        query: userPrompt,
        timestamp: Date.now(),
      };
      accumulatedAgentSteps.push(step1);
      writeNdjson(res, { type: 'agent_step', step: step1 });

      if (promptLower.includes('курс') || promptLower.includes('доллар') || promptLower.includes('валют') || promptLower.includes('погод') || promptLower.includes('метео')) {
        const fallbackTool = { id: 't1', name: 'get_weather_and_rates', label: 'Запрос курсов НБТ и метеоданных…', state: 'running', args: { type: 'all' } };
        emitAssistantToken(buildToolNarration([fallbackTool], language, false));
        startTimelineTool(fallbackTool);
        writeNdjson(res, { type: 'tool_start', ...fallbackTool });
        const resTool = await executeChatTool('get_weather_and_rates', { type: 'all' }, context);
        accumulatedToolCalls.push({ ...fallbackTool, result: resTool, state: resTool.success ? 'done' : 'error' });
        accumulatedSources.push(...resTool.sources);
        writeNdjson(res, { type: 'sources', items: resTool.sources });
        writeNdjson(res, { type: 'tool_done', id: 't1', name: 'get_weather_and_rates', state: resTool.success ? 'done' : 'error', resultSummary: resTool.summary });
        finishTimelineTool('t1', resTool.success ? 'done' : 'error', resTool.summary);

        const readStep = {
          id: `step_${Date.now()}_2`,
          stage: 'reading',
          label: 'Прочитано: Национальный банк и Гидромет РТ',
          count: resTool.sources?.length || 2,
          readingTitle: 'Курсы НБТ и метеопредупреждения',
          domain: 'nbt.tj',
          timestamp: Date.now(),
        };
        accumulatedAgentSteps.push(readStep);
        writeNdjson(res, { type: 'agent_step', step: readStep });

        const ratesList = resTool.data?.exchange_rates?.rates || [];
        const alertsList = resTool.data?.weather?.alerts || [];
        fallbackAnswer = `### Сводка курсов валют и метеоданных\n\n`;
        if (ratesList.length > 0) {
          fallbackAnswer += `**Официальные курсы НБТ:**\n\n| Валюта | Название | Курс к TJS |\n| :--- | :--- | :--- |\n`;
          for (const r of ratesList.slice(0, 5)) {
            fallbackAnswer += `| **${r.currency}** | ${r.name} | **${r.rate_to_tjs} TJS** |\n`;
          }
          fallbackAnswer += `\n`;
        }
        if (alertsList.length > 0) {
          fallbackAnswer += `**Предупреждения Гидромета:**\n\n`;
          for (const a of alertsList) {
            fallbackAnswer += `- ⚠️ ${a.text}\n`;
          }
        }
      } else {
        const toolToUse = modes.webSearch ? 'search_web_exa' : 'search_news';
        const fallbackTool = { id: 't1', name: toolToUse, label: 'Поиск материалов…', state: 'running', args: { query: userPrompt || 'Таджикистан', limit: 4 } };
        emitAssistantToken(buildToolNarration([fallbackTool], language, false));
        startTimelineTool(fallbackTool);
        writeNdjson(res, { type: 'tool_start', ...fallbackTool });
        const resTool = await executeChatTool(toolToUse, { query: userPrompt || 'Таджикистан', limit: 4 }, context);
        accumulatedToolCalls.push({ ...fallbackTool, result: resTool, state: resTool.success ? 'done' : 'error' });
        accumulatedSources.push(...(resTool.sources || []));
        writeNdjson(res, { type: 'sources', items: resTool.sources || [] });
        writeNdjson(res, { type: 'tool_done', id: 't1', name: toolToUse, state: resTool.success ? 'done' : 'error', resultSummary: resTool.summary });
        finishTimelineTool('t1', resTool.success ? 'done' : 'error', resTool.summary);

        const readStep = {
          id: `step_${Date.now()}_2`,
          stage: 'reading',
          label: resTool.sources?.[0]?.title ? `Прочитано: ${resTool.sources[0].title.slice(0, 45)}...` : 'Анализ источников',
          count: resTool.found_count || resTool.sources?.length || 0,
          readingTitle: resTool.sources?.[0]?.title,
          domain: resTool.sources?.[0]?.domain,
          timestamp: Date.now(),
        };
        accumulatedAgentSteps.push(readStep);
        writeNdjson(res, { type: 'agent_step', step: readStep });

        if (resTool.articles?.length || resTool.results?.length) {
          const itemsList = resTool.articles || resTool.results || [];
          fallbackAnswer = `По вашему запросу найдены следующие публикации:\n\n`;
          for (let i = 0; i < itemsList.length; i++) {
            const art = itemsList[i];
            const citation = art.citation_id || `[N${i + 1}]`;
            fallbackAnswer += `### ${citation} ${art.title}\n${art.description || art.snippet || 'Описание отсутствует.'}\n*Источник: ${art.source || art.domain || 'Официальный портал'}*\n\n`;
          }
        } else {
          fallbackAnswer = `По запросу «${userPrompt}» материалов не найдено. Для полноценного ИИ-диалога с языковой моделью добавьте \`OPENAI_API_KEY\` в файл \`.env\`.`;
        }
      }

      // Stream fallback tokens
      const words = fallbackAnswer.split(' ');
      for (const word of words) {
        if (abortController.signal.aborted) break;
        const part = `${word} `;
        emitAssistantToken(part);
        await new Promise((r) => setTimeout(r, 20));
      }
    } else {
      // Full LLM execution with tool-calling loop
      let currentMessages = [...messagesContext];
      const maxToolIterations = reasoningEffort === 'high' ? 4 : reasoningEffort === 'low' ? 2 : 3;
      let toolIterations = 0;
      let round = 0;

      while (round <= maxToolIterations) {
        round++;
        const roundContentStart = assistantContent.length;
        const allowToolsThisRound = enableTools && toolIterations < maxToolIterations && activeTools.length > 0;
        const activityId = `activity_round_${round}_${Date.now()}`;
        const activityStartLabel = round === 1
          ? reasoningEffortLabel(reasoningEffort, language)
          : (language === 'tg' ? 'Муқоисаи натиҷаҳои ҷустуҷӯ' : 'Сопоставление результатов поиска');
        emitActivity({
          id: activityId,
          stage: 'thinking',
          label: activityStartLabel,
          timestamp: Date.now(),
        });
        let activityFinished = false;
        const finishActivity = () => {
          if (activityFinished) return;
          activityFinished = true;
          emitActivity({
            id: activityId,
            stage: 'done',
            label: round === 1
              ? (language === 'tg' ? 'Дархост таҳлил шуд' : 'Запрос проанализирован')
              : (language === 'tg' ? 'Натиҷаҳо муқоиса шуданд' : 'Результаты сопоставлены'),
            timestamp: Date.now(),
          });
        };
        const llmBody = {
          model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          temperature: 0.3,
          messages: currentMessages,
          stream: true,
          reasoning_effort: reasoningEffort,
        };

        if (allowToolsThisRound) {
          llmBody.tools = activeTools;
          llmBody.tool_choice = 'auto';
        }

        const requestProvider = (requestBody) => fetch(resolveChatCompletionsUrl(process.env.OPENAI_BASE_URL), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal,
          });

        let upstreamRes = await requestProvider(llmBody);
        if (!upstreamRes.ok && (upstreamRes.status === 400 || upstreamRes.status === 422)) {
          await upstreamRes.text().catch(() => '');
          const compatibleBody = { ...llmBody };
          delete compatibleBody.reasoning_effort;
          console.warn('chat_reasoning_effort_unsupported', {
            model: llmBody.model,
            effort: reasoningEffort,
            status: upstreamRes.status,
          });
          upstreamRes = await requestProvider(compatibleBody);
        }

        if (!upstreamRes.ok) {
          throw new Error(`AI provider: HTTP ${upstreamRes.status}`);
        }
        if (!upstreamRes.body) {
          throw new Error('AI provider не вернул поток данных.');
        }

        let pendingToolCalls = [];
        let roundAssistantText = '';

        const thinkParser = createThinkStreamParser({
          onToken: emitAssistantToken,
          onThinkToken: (tok) => {
            assistantThinking += tok;
            if (!writeNdjson(res, { type: 'think_token', value: tok })) {
              void once(res, 'drain');
            }
          },
          onThinkStart: () => {
            const thinkStep = {
              id: `step_think_${Date.now()}`,
              stage: 'thinking',
              label: 'Обдумывание и анализ...',
              timestamp: Date.now(),
            };
            accumulatedAgentSteps.push(thinkStep);
            writeNdjson(res, { type: 'agent_step', step: thinkStep });
          },
        });
        const toolMarkupFilter = createToolMarkupStreamFilter((text) => thinkParser.feed(text));

        for await (const payload of parseOpenAiSse(upstreamRes.body)) {
          const choice = payload?.choices?.[0];
          if (!choice) continue;

          // Check delta for text content
          const deltaContent = choice.delta?.content;
          if (deltaContent || choice.delta?.tool_calls) finishActivity();
          if (deltaContent) {
            roundAssistantText += deltaContent;
            toolMarkupFilter.feed(deltaContent);
          }

          // Check delta for tool calls
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', arguments: '' };
              }
              if (tc.function?.name) pendingToolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[idx].arguments += tc.function.arguments;
            }
          }
        }

        toolMarkupFilter.flush();
        thinkParser.flush();
        finishActivity();

        // Providers may serialize tool calls as text even when the OpenAI tool
        // contract is supplied. Parse the complete round, but never expose the
        // provider-specific markup to the conversation.
        const parsedTextCalls = parseTextToolCalls(roundAssistantText);
        if (pendingToolCalls.filter(Boolean).length === 0 && parsedTextCalls.toolCalls.length > 0) {
          pendingToolCalls = parsedTextCalls.toolCalls;
        }
        if (parsedTextCalls.toolCalls.length > 0 || toolMarkupFilter.suppressed) {
          roundAssistantText = parsedTextCalls.cleanText;
        }
        if (toolMarkupFilter.suppressed && pendingToolCalls.filter(Boolean).length === 0) {
          throw new Error('AI provider вернул некорректный вызов инструмента.');
        }

        // If tool calls were made
        pendingToolCalls = pendingToolCalls
          .filter(Boolean)
          .map((tc, index) => ({
            id: String(tc.id || `call_${round}_${index}`).slice(0, 160),
            name: normalizeToolName(tc.name),
            arguments: String(tc.arguments || '{}').slice(0, 8_000),
          }));

        const allowedToolNames = new Set(activeTools.map((tool) => tool.function.name));
        pendingToolCalls = pendingToolCalls.filter((tc) => allowedToolNames.has(tc.name));

        for (const tc of pendingToolCalls) {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.arguments || '{}');
          } catch {}
          tc.args = normalizeToolArguments(tc.name, parsedArgs);
        }

        if (pendingToolCalls.length > 0 && allowToolsThisRound) {
          toolIterations++;
          currentMessages.push({
            role: 'assistant',
            content: roundAssistantText || null,
            tool_calls: pendingToolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });

          if (assistantContent.length === roundContentStart) {
            emitAssistantToken(buildToolNarration(pendingToolCalls, language, toolIterations > 1));
          }

          for (const tc of pendingToolCalls) {
            const parsedArgs = tc.args;

            const isSearch = tc.name === 'search_news' || tc.name === 'search_web_exa';
            const toolLabel =
              tc.name === 'search_news'
                ? `Поиск в базе: "${parsedArgs.query || ''}"`
                : tc.name === 'search_web_exa'
                  ? `Поиск в сети Exa: "${parsedArgs.query || ''}"`
                  : tc.name === 'get_recent_news'
                    ? 'Запрос последних новостей'
                    : tc.name === 'get_location_info'
                      ? `География: "${parsedArgs.location_query || ''}"`
                      : tc.name === 'get_weather_and_rates'
                        ? 'Запрос курсов валют и метео'
                        : tc.name === 'research_place'
                          ? `Исследование: ${parsedArgs.location_id}`
                          : `Вызов ${tc.name}`;

            if (isSearch) {
              const searchStep = {
                id: `step_search_${tc.id}`,
                stage: toolIterations > 1 ? 'refining' : 'search',
                label: toolIterations > 1 ? `Уточняющий поиск: "${parsedArgs.query || ''}"` : `Поиск: "${parsedArgs.query || ''}"`,
                query: parsedArgs.query,
                timestamp: Date.now(),
              };
              accumulatedAgentSteps.push(searchStep);
              writeNdjson(res, { type: 'agent_step', step: searchStep });
            }

            const timelineTool = { id: tc.id, name: tc.name, label: toolLabel, state: 'running', args: parsedArgs };
            startTimelineTool(timelineTool);
            writeNdjson(res, { type: 'tool_start', ...timelineTool });
            const toolResult = await executeChatTool(tc.name, parsedArgs, context);
            if (!toolResult.success) {
              console.warn('chat_tool_failed', {
                conversationId,
                toolCallId: tc.id,
                toolName: tc.name,
                reason: String(toolResult.error || toolResult.message || 'unknown').slice(0, 300),
              });
            }

            if (toolResult.sources?.length) {
              accumulatedSources.push(...toolResult.sources);
              writeNdjson(res, { type: 'sources', items: toolResult.sources });

              const readStep = {
                id: `step_read_${tc.id}`,
                stage: 'reading',
                label: `Прочитано ${toolResult.sources.length} источников`,
                count: toolResult.sources.length,
                readingTitle: toolResult.sources[0]?.title,
                domain: toolResult.sources[0]?.domain,
                timestamp: Date.now(),
              };
              accumulatedAgentSteps.push(readStep);
              writeNdjson(res, { type: 'agent_step', step: readStep });
            }

            accumulatedToolCalls.push({
              id: tc.id,
              name: tc.name,
              args: parsedArgs,
              result: toolResult,
              state: toolResult.success ? 'done' : 'error',
              label: toolLabel,
            });

            writeNdjson(res, {
              type: 'tool_done',
              id: tc.id,
              name: tc.name,
              state: toolResult.success ? 'done' : 'error',
              resultSummary: toolResult.summary || (toolResult.success ? 'Готово' : 'Ошибка'),
            });
            finishTimelineTool(tc.id, toolResult.success ? 'done' : 'error', toolResult.summary || toolResult.error);

            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            });
          }
        } else {
          // No more tool calls, streaming completed
          break;
        }
      }
    }

    // Save final assistant message
    const sanitized = sanitizeThinkTags(assistantContent, assistantThinking);
    const assistantMsg = await createMessage({
      conversationId,
      role: 'assistant',
      content: sanitized.content,
      thinking_content: sanitized.thinking,
      sources: accumulatedSources,
      tool_calls: accumulatedToolCalls,
      agent_steps: accumulatedAgentSteps,
      metadata: { timeline },
    });

    writeNdjson(res, { type: 'message_saved', messageId: assistantMsg.id, conversationId });

    // Auto-generate title if conversation has default title or is new
    if (conv.title === 'Новый разговор' || isNewConv) {
      generateConversationTitle(userPrompt, assistantContent)
        .then(async (newTitle) => {
          if (newTitle && newTitle !== 'Новый разговор') {
            await updateConversation(conversationId, { title: newTitle }, { sessionId, userId });
          }
        })
        .catch(() => {});
    }

    writeNdjson(res, { type: 'done' });
    res.end();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Внутренняя ошибка чата';
    if (!res.destroyed && !res.writableEnded) {
      const safeErrorContent = assistantContent || (language === 'tg'
        ? '⚠️ Ҷавоби ИИ гирифта нашуд. Лутфан дубора кӯшиш кунед.'
        : '⚠️ Не удалось получить корректный ответ ИИ. Попробуйте ещё раз.');
      if (!assistantContent) {
        timeline.push({ type: 'assistant', id: `text_${timeline.length}`, content: safeErrorContent });
      }
      await createMessage({
        conversationId,
        role: 'assistant',
        content: safeErrorContent,
        sources: accumulatedSources,
        tool_calls: accumulatedToolCalls,
        metadata: { timeline },
        error_state: errorMsg,
      }).catch(() => {});
      writeNdjson(res, { type: 'error', message: errorMsg });
      writeNdjson(res, { type: 'done' });
      res.end();
    }
  } finally {
    clearTimeout(timeout);
  }
}

// --------------------------------------------------------------------------
// STATIC FILE SERVER
// --------------------------------------------------------------------------

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

async function serveStatic(url, res) {
  const requested = url === '/' ? 'index.html' : url.slice(1);
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, 'dist', safe);
  try {
    if (!(await stat(file)).isFile()) throw new Error();
  } catch {
    file = join(root, 'dist', 'index.html');
  }
  try {
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    json(res, 404, { error: 'Сначала выполните npm run build' });
  }
}

// --------------------------------------------------------------------------
// HTTP ROUTER
// --------------------------------------------------------------------------

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const sessionId = String(req.headers['x-session-id'] || 'default-session').slice(0, 128);
    const userId = req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null;

    // Health
    if (url.pathname === '/api/health') {
      return json(res, 200, { ok: true, service: 'tajikistan-monitor', time: new Date().toISOString() });
    }

    // Core Monitor APIs
    if (url.pathname === '/api/news' && req.method === 'GET') {
      const data = await loadNews(url.searchParams.get('refresh') === '1');
      return json(res, 200, { items: data.items, updatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const data = await loadNews();
      return json(res, 200, { sources: data.statuses, references: referenceSources });
    }
    if (url.pathname === '/api/weather' && req.method === 'GET') {
      const data = await loadNews();
      return json(res, 200, { ...data.weather, updatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/api/exchange-rates' && req.method === 'GET') {
      const data = await loadNews();
      return json(res, 200, { base: 'TJS', rates: data.rates, updatedAt: new Date().toISOString() });
    }

    // AI Explainer & Research
    if (url.pathname === '/api/ai/explain' && req.method === 'POST') {
      return await explainNews(req, res);
    }
    if (url.pathname === '/api/ai/location-summary' && req.method === 'POST') {
      return await summarizeLocation(req, res);
    }
    if (url.pathname === '/api/ai/place-research' && req.method === 'POST') {
      return await researchPlace(req, res);
    }

    // AI Chat Streaming
    if (url.pathname === '/api/ai/chat' && req.method === 'POST') {
      return await handleStreamChat(req, res);
    }

    // Chat Conversations CRUD
    if (url.pathname === '/api/chat/conversations' && req.method === 'GET') {
      const query = url.searchParams.get('query') || '';
      const limit = Number(url.searchParams.get('limit')) || 50;
      const offset = Number(url.searchParams.get('offset')) || 0;
      const list = await listConversations({ sessionId, userId, query, limit, offset });
      return json(res, 200, { conversations: list });
    }

    if (url.pathname === '/api/chat/conversations' && req.method === 'POST') {
      const body = await readBody(req);
      const created = await createConversation({
        sessionId,
        userId,
        title: body.title || 'Новый разговор',
        pinned: body.pinned || false,
        metadata: body.metadata || {},
      });
      return json(res, 201, { conversation: created });
    }

    // Single conversation routes
    const convMatch = /^\/api\/chat\/conversations\/([^/]+)$/.exec(url.pathname);
    if (convMatch) {
      const convId = convMatch[1];
      if (req.method === 'GET') {
        const conv = await getConversation(convId, { sessionId, userId });
        if (!conv) return json(res, 404, { error: 'Диалог не найден' });
        const messages = await listMessages(convId);
        return json(res, 200, { conversation: conv, messages });
      }
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        const updated = await updateConversation(convId, body, { sessionId, userId });
        return json(res, 200, { conversation: updated });
      }
      if (req.method === 'DELETE') {
        await deleteConversation(convId, { sessionId, userId });
        return json(res, 200, { ok: true, deletedId: convId });
      }
    }

    // Conversation messages routes
    const msgListMatch = /^\/api\/chat\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
    if (msgListMatch) {
      const convId = msgListMatch[1];
      if (req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit')) || 100;
        const offset = Number(url.searchParams.get('offset')) || 0;
        const messages = await listMessages(convId, { limit, offset });
        return json(res, 200, { messages });
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const created = await createMessage({
          conversationId: convId,
          role: body.role || 'user',
          content: body.content || '',
          sources: body.sources || [],
          tool_calls: body.tool_calls || [],
          metadata: body.metadata || {},
        });
        return json(res, 201, { message: created });
      }
    }

    // Single message routes
    const msgMatch = /^\/api\/chat\/messages\/([^/]+)$/.exec(url.pathname);
    if (msgMatch) {
      const msgId = msgMatch[1];
      const convId = url.searchParams.get('conversationId') || '';
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        const updated = await updateMessage(msgId, convId, body);
        return json(res, 200, { message: updated });
      }
      if (req.method === 'DELETE') {
        await deleteMessage(msgId, convId);
        return json(res, 200, { ok: true, deletedId: msgId });
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json(res, 404, { error: 'Маршрут не найден' });
    }

    return await serveStatic(url.pathname, res);
  } catch (error) {
    if (res.headersSent || res.destroyed) return res.destroy();
    return json(res, 500, { error: error instanceof Error ? error.message : 'Внутренняя ошибка' });
  }
}).listen(port, '127.0.0.1', () => console.log(`Tajikistan Monitor API: http://127.0.0.1:${port}`));
