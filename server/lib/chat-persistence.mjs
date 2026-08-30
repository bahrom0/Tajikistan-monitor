import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChatCompletionsUrl } from './openai-stream.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const LOCAL_STORE_FILE = join(root, '.chat_store.json');

const projectUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export function shouldPersistChatLocally(env = process.env) {
  if (env.VERCEL === '1') return false;
  if (env.CHAT_LOCAL_PERSISTENCE === 'true') return true;
  if (env.CHAT_LOCAL_PERSISTENCE === 'false') return false;
  return true;
}

const localPersistenceEnabled = shouldPersistChatLocally();

if (!localPersistenceEnabled && (!projectUrl || !serviceKey)) {
  console.warn('chat_persistence_ephemeral', {
    runtime: 'vercel',
    missingSupabaseUrl: !projectUrl,
    missingSupabaseKey: !serviceKey,
  });
}

function normalizeStoredMessage(message) {
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  return {
    ...message,
    thinking_content: message?.thinking_content ?? metadata.thinking_content,
    agent_steps: Array.isArray(message?.agent_steps)
      ? message.agent_steps
      : Array.isArray(metadata.agent_steps)
        ? metadata.agent_steps
        : [],
  };
}

// In-memory cache + file backup for reliable persistence
let memoryStore = {
  conversations: new Map(),
  messages: new Map(), // key: conversation_id, value: array of messages
  loaded: false,
};

async function initLocalStore() {
  if (memoryStore.loaded) return;
  if (!localPersistenceEnabled) {
    memoryStore.loaded = true;
    return;
  }
  try {
    const raw = await readFile(LOCAL_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.conversations) {
      for (const c of parsed.conversations) memoryStore.conversations.set(c.id, c);
    }
    if (parsed.messages) {
      for (const [convId, msgs] of Object.entries(parsed.messages)) {
        memoryStore.messages.set(convId, msgs);
      }
    }
  } catch {
    // Fresh store
  }
  memoryStore.loaded = true;
}

async function persistLocalStore() {
  if (!localPersistenceEnabled) return;
  try {
    const data = {
      conversations: Array.from(memoryStore.conversations.values()),
      messages: Object.fromEntries(memoryStore.messages.entries()),
    };
    await writeFile(LOCAL_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to persist local chat store:', err);
  }
}

// Helper for Supabase REST API
async function supabaseRequest(path, method = 'GET', body = null, headers = {}) {
  if (!projectUrl || !serviceKey) return null;
  try {
    const res = await fetch(`${projectUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' || method === 'PATCH' ? 'return=representation' : undefined,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function listConversations({ sessionId, userId, query = '', limit = 50, offset = 0 }) {
  await initLocalStore();

  let localList = Array.from(memoryStore.conversations.values()).filter((c) => {
    const matchUser = userId ? c.user_id === userId : c.session_id === sessionId;
    if (!matchUser && c.session_id !== sessionId) return false;
    if (query && !c.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  localList.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at);
  });

  // Try Supabase first
  if (projectUrl && serviceKey) {
    try {
      let filter = `order=updated_at.desc&limit=${limit}&offset=${offset}`;
      if (userId) {
        filter += `&user_id=eq.${userId}`;
      } else if (sessionId) {
        filter += `&session_id=eq.${sessionId}`;
      }
      const remote = await supabaseRequest(`chat_conversations?select=*&${filter}`);
      if (Array.isArray(remote) && remote.length > 0) {
        for (const c of remote) memoryStore.conversations.set(c.id, c);
        let list = remote;
        if (query) {
          const q = query.toLowerCase();
          list = list.filter((c) => c.title.toLowerCase().includes(q));
        }
        return list;
      }
    } catch {}
  }

  return localList.slice(offset, offset + limit);
}

export async function getConversation(id, { sessionId, userId } = {}) {
  await initLocalStore();
  const local = memoryStore.conversations.get(id);
  if (projectUrl && serviceKey) {
    try {
      const remote = await supabaseRequest(`chat_conversations?id=eq.${id}&select=*`);
      if (Array.isArray(remote) && remote.length > 0) {
        memoryStore.conversations.set(id, remote[0]);
        return remote[0];
      }
    } catch {}
  }
  return local || null;
}

export async function createConversation({ id, sessionId, userId = null, title = 'Новый разговор', pinned = false, metadata = {} }) {
  await initLocalStore();
  const convId = id || randomUUID();
  const now = new Date().toISOString();
  const item = {
    id: convId,
    session_id: sessionId || 'default',
    user_id: userId,
    title: title.slice(0, 300),
    pinned: Boolean(pinned),
    metadata: metadata || {},
    created_at: now,
    updated_at: now,
  };

  memoryStore.conversations.set(convId, item);
  if (!memoryStore.messages.has(convId)) memoryStore.messages.set(convId, []);
  void persistLocalStore();

  if (projectUrl && serviceKey) {
    void supabaseRequest('chat_conversations', 'POST', item);
  }

  return item;
}

export async function updateConversation(id, patch, { sessionId, userId } = {}) {
  await initLocalStore();
  const existing = memoryStore.conversations.get(id);

  const now = new Date().toISOString();
  const updated = {
    ...(existing || { id }),
    ...patch,
    updated_at: now,
  };

  memoryStore.conversations.set(id, updated);
  void persistLocalStore();

  if (projectUrl && serviceKey) {
    void supabaseRequest(`chat_conversations?id=eq.${id}`, 'PATCH', patch);
  }

  return updated;
}

export async function deleteConversation(id, { sessionId, userId } = {}) {
  await initLocalStore();
  memoryStore.conversations.delete(id);
  memoryStore.messages.delete(id);
  void persistLocalStore();

  if (projectUrl && serviceKey) {
    void supabaseRequest(`chat_conversations?id=eq.${id}`, 'DELETE');
  }

  return true;
}

export async function listMessages(conversationId, { limit = 100, offset = 0 } = {}) {
  await initLocalStore();
  const localMsgs = memoryStore.messages.get(conversationId) || [];

  if (projectUrl && serviceKey) {
    try {
      const remote = await supabaseRequest(`chat_messages?conversation_id=eq.${conversationId}&select=*&order=created_at.asc&limit=${limit}&offset=${offset}`);
      if (Array.isArray(remote) && remote.length > 0) {
        const normalized = remote.map(normalizeStoredMessage);
        memoryStore.messages.set(conversationId, normalized);
        return normalized;
      }
    } catch {}
  }

  return localMsgs.slice(offset, offset + limit);
}

export async function createMessage({
  id,
  conversationId,
  role,
  content,
  thinking_content = undefined,
  sources = [],
  tool_calls = [],
  agent_steps = [],
  error_state = null,
  metadata = {},
}) {
  await initLocalStore();
  const msgId = id || randomUUID();
  const now = new Date().toISOString();
  const message = {
    id: msgId,
    conversation_id: conversationId,
    role,
    content: String(content || ''),
    thinking_content: thinking_content ? String(thinking_content) : undefined,
    sources: Array.isArray(sources) ? sources : [],
    tool_calls: Array.isArray(tool_calls) ? tool_calls : [],
    agent_steps: Array.isArray(agent_steps) ? agent_steps : [],
    error_state,
    metadata,
    created_at: now,
    updated_at: now,
  };

  if (projectUrl && serviceKey) {
    const remoteMessage = {
      id: message.id,
      conversation_id: message.conversation_id,
      role: message.role,
      content: message.content,
      sources: message.sources,
      tool_calls: message.tool_calls,
      error_state: message.error_state,
      metadata: {
        ...message.metadata,
        ...(message.thinking_content ? { thinking_content: message.thinking_content } : {}),
        ...(message.agent_steps.length > 0 ? { agent_steps: message.agent_steps } : {}),
      },
      created_at: message.created_at,
      updated_at: message.updated_at,
    };
    await supabaseRequest('chat_messages', 'POST', remoteMessage);
  }

  const msgs = memoryStore.messages.get(conversationId) || [];
  msgs.push(message);
  memoryStore.messages.set(conversationId, msgs);

  // Update conversation updated_at
  const conv = memoryStore.conversations.get(conversationId);
  if (conv) {
    conv.updated_at = now;
    memoryStore.conversations.set(conversationId, conv);
  }

  void persistLocalStore();
  return message;
}

export async function updateMessage(id, conversationId, patch) {
  await initLocalStore();
  const now = new Date().toISOString();

  if (projectUrl && serviceKey) {
    await supabaseRequest(`chat_messages?id=eq.${id}`, 'PATCH', patch);
  }

  const msgs = memoryStore.messages.get(conversationId) || [];
  const idx = msgs.findIndex((m) => m.id === id);
  if (idx >= 0) {
    msgs[idx] = { ...msgs[idx], ...patch, updated_at: now };
    memoryStore.messages.set(conversationId, msgs);
    void persistLocalStore();
    return msgs[idx];
  }
  return null;
}

export async function deleteMessage(id, conversationId) {
  await initLocalStore();
  if (projectUrl && serviceKey) {
    await supabaseRequest(`chat_messages?id=eq.${id}`, 'DELETE');
  }
  const msgs = memoryStore.messages.get(conversationId) || [];
  const filtered = msgs.filter((m) => m.id !== id);
  memoryStore.messages.set(conversationId, filtered);
  void persistLocalStore();
  return true;
}

export async function truncateMessagesAfter(conversationId, messageId) {
  await initLocalStore();
  const msgs = memoryStore.messages.get(conversationId) || [];
  const idx = msgs.findIndex((m) => m.id === messageId);
  if (idx >= 0) {
    const keep = msgs.slice(0, idx + 1);
    memoryStore.messages.set(conversationId, keep);
    void persistLocalStore();
    return keep;
  }
  return msgs;
}

export const TOPIC_ICON_KEYS = [
  'code',
  'gamepad',
  'search',
  'brain',
  'sparkles',
  'newspaper',
  'sun',
  'trending',
  'map',
  'book',
  'heart',
  'music',
  'message',
];

export function classifyTopicIcon(text = '') {
  const lower = String(text).toLowerCase();
  if (/код|программ|javascript|python|typescript|css|html|bug|error|git|api|sql|функци|разработк|сервер|backend|frontend|react|preact|linux|bash|docker/.test(lower)) return 'code';
  if (/игр|гейм|играть|steam|ps5|xbox|dota|cs|minecraft|game|геймплей|квест|rpg/.test(lower)) return 'gamepad';
  if (/погод|температур|дожд|снег|жар|градус|ветер|прогноз|климат|метео|сели|паводок/.test(lower)) return 'sun';
  if (/курс|валют|доллар|сомони|рубл|евро|банк|деньг|финанс|цен|стоимост|нбт|экономик|бизнес|инвестиц/.test(lower)) return 'trending';
  if (/психолог|чувств|стресс|отношен|депресси|тревог|мысл|душа|совет|мотиваци|переживан/.test(lower)) return 'brain';
  if (/новост|событи|ховар|ази|происшеств|президент|правительств|указ|агентств|сми/.test(lower)) return 'newspaper';
  if (/музык|песн|трек|альбом|концерт|мелоди|певец|аудио/.test(lower)) return 'music';
  if (/факт|почем|зачем|истори|книг|учеб|наук|правил|закон|язык|таджикск|перевод|литератур|культура/.test(lower)) return 'book';
  if (/душанбе|худжанд|бохтар|куляб|хорог|таджикистан|тоҷикистон|район|город|гбао|согд|хатлон|варзоб|памир|туризм|карта/.test(lower)) return 'map';
  if (/здоров|больниц|врач|лекарств|симптом|болезн|медицин|аптек|лечен|диета|спорт|тренировк/.test(lower)) return 'heart';
  if (/найди|поищ|поиск|провер|источник|интернет|информаци|гугл|яндекс/.test(lower)) return 'search';
  if (/иде|придумай|напиши|креатив|стих|рассказ|ai|интеллект|нейросет|сочини/.test(lower)) return 'sparkles';
  return 'message';
}

// Asynchronous title & topic icon generator using lightweight prompt
export async function generateConversationTitle(userPrompt, assistantResponse = '') {
  const combined = `${userPrompt} ${assistantResponse}`;
  const fallbackIcon = classifyTopicIcon(combined);
  const fallbackTitle = userPrompt.trim().replace(/^["'«»\s]+|["'«»\s]+$/g, '').slice(0, 50) || 'Новый разговор';

  if (!process.env.OPENAI_API_KEY) {
    return {
      title: fallbackTitle,
      icon: fallbackIcon,
    };
  }

  try {
    const res = await fetch(resolveChatCompletionsUrl(process.env.OPENAI_BASE_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `Ты создаешь краткие емкие названия (2-5 слов) для диалогов и выбираешь одну наиболее подходящую иконку темы из доступного списка.
Название должно быть на языке запроса пользователя (русский или таджикский), без кавычек и точек в конце.

Доступные иконки темы (выбери строго одну из них):
- "code" — Программирование, IT, разработка, скрипты, технологии
- "gamepad" — Игры, гейминг, киберспорт, развлечения
- "search" — Поиск информации, расследования, фактчекинг
- "brain" — Психология, размышления, эмоции, мотивация, философия
- "sparkles" — Идеи, креатив, AI, генерация текстов, творчество
- "newspaper" — Новости, политика, официальные события, происшествия
- "sun" — Погода, климат, природа, времена года
- "trending" — Финансы, экономика, деньги, курсы валют, бизнес
- "map" — Таджикистан, города, районы, география, туризм
- "book" — Наука, история, книги, образование, язык
- "heart" — Здоровье, медицина, спорт, образ жизни
- "music" — Музыка, культура, искусство
- "message" — Общий разговор, приветствие, прочее

Ответь ТОЛЬКО в формате JSON:
{"title": "Краткое название", "icon": "выбранная_иконка"}`,
          },
          {
            role: 'user',
            content: `Вопрос пользователя: "${userPrompt.slice(0, 300)}"\nОтвет: "${assistantResponse.slice(0, 300)}"`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content?.trim() || '';
      try {
        const cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleanJson);
        const parsedTitle = typeof parsed.title === 'string' ? parsed.title.trim().replace(/^["'«»]+|["'«»]+$/g, '').slice(0, 60) : '';
        const parsedIcon = typeof parsed.icon === 'string' && TOPIC_ICON_KEYS.includes(parsed.icon.toLowerCase())
          ? parsed.icon.toLowerCase()
          : fallbackIcon;

        if (parsedTitle && parsedTitle.length >= 2) {
          return {
            title: parsedTitle,
            icon: parsedIcon,
          };
        }
      } catch {
        const singleTitle = raw.replace(/^["'«»]+|["'«»]+$/g, '').slice(0, 60);
        if (singleTitle && singleTitle.length >= 2) {
          return {
            title: singleTitle,
            icon: fallbackIcon,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Title generation error:', err.message);
  }

  return {
    title: fallbackTitle,
    icon: fallbackIcon,
  };
}

// Context optimization: sliding window
export function buildOptimizedContext(systemPrompt, pastMessages, currentPrompt, maxTurns = 8) {
  const result = [{ role: 'system', content: systemPrompt }];

  // Keep the most recent past messages
  const windowed = pastMessages.slice(-maxTurns);
  for (const m of windowed) {
    if (m.role === 'user' || m.role === 'assistant') {
      result.push({
        role: m.role,
        content: m.content.slice(0, 4000),
      });
    }
  }

  if (currentPrompt) {
    result.push({ role: 'user', content: currentPrompt });
  }

  return result;
}
