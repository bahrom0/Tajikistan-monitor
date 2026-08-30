const COMPLEX_TASK_RE = /(?:анализ|проанализ|сравн|сопостав|исслед|проверь|фактчек|причин|последств|сценари|стратег|подроб|комплекс|объясни почему|таҳлил|муқоиса|санҷ|таҳқиқ|compare|analy[sz]e|research|verify|investigate)/i;
const SIMPLE_TASK_RE = /^(?:какой|какая|какие|кто|что|где|когда|сколько|покажи|найди|курс|погода|последние|охирин|ки|чӣ|куҷо|кай|чанд|what|who|where|when|how much)(?:\s|[?!,.]|$)/i;

export function selectReasoningEffort(prompt, modes = {}) {
  const text = String(prompt || '').trim();
  if (modes.officialStrict || text.length > 600 || COMPLEX_TASK_RE.test(text)) return 'high';
  if (text.length <= 140 && SIMPLE_TASK_RE.test(text)) return 'low';
  return 'medium';
}

export function reasoningEffortLabel(effort, language = 'ru') {
  if (language === 'tg') {
    if (effort === 'high') return 'Таҳлили амиқи дархост';
    if (effort === 'low') return 'Таҳлили кӯтоҳи дархост';
    return 'Таҳлили дархост';
  }
  if (effort === 'high') return 'Углублённый анализ запроса';
  if (effort === 'low') return 'Быстрый анализ запроса';
  return 'Анализ запроса';
}

function shortValue(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function buildToolNarration(toolCalls, language = 'ru', isFollowUp = false) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  if (calls.length === 0) return '';

  if (calls.length > 1) {
    return language === 'tg'
      ? 'Ҳоло чанд самтро месанҷам ва натиҷаҳоро муқоиса мекунам.\n\n'
      : 'Сейчас проверю несколько направлений и сопоставлю результаты.\n\n';
  }

  const call = calls[0];
  const args = call.args || {};
  const query = shortValue(args.query || args.location_id || args.location_query);
  const prefix = isFollowUp
    ? (language === 'tg' ? 'Барои дақиқ кардани натиҷа' : 'Чтобы уточнить результат')
    : (language === 'tg' ? 'Ҳоло' : 'Сейчас');

  if (call.name === 'search_web_exa') {
    return language === 'tg'
      ? `${prefix} дар интернет маълумоти навро${query ? ` оид ба «${query}»` : ''} меҷӯям.\n\n`
      : `${prefix} поищу в интернете актуальную информацию${query ? ` по запросу «${query}»` : ''}.\n\n`;
  }
  if (call.name === 'search_news' || call.name === 'get_recent_news') {
    return language === 'tg'
      ? `${prefix} хабарҳои расмиро${query ? ` оид ба «${query}»` : ''} месанҷам.\n\n`
      : `${prefix} проверю официальные новости${query ? ` по теме «${query}»` : ''}.\n\n`;
  }
  if (call.name === 'research_place') {
    return language === 'tg'
      ? `${prefix} маводро${query ? ` оид ба «${query}»` : ''} ҷамъ мекунам.\n\n`
      : `${prefix} соберу и сопоставлю материалы${query ? ` по территории «${query}»` : ''}.\n\n`;
  }
  if (call.name === 'get_location_info') {
    return language === 'tg'
      ? `${prefix} маълумоти ҷуғрофиро${query ? ` оид ба «${query}»` : ''} месанҷам.\n\n`
      : `${prefix} проверю канонические географические данные${query ? ` по «${query}»` : ''}.\n\n`;
  }
  if (call.name === 'get_weather_and_rates') {
    return language === 'tg'
      ? `${prefix} маълумоти расмии обу ҳаво ва қурби асъорро месанҷам.\n\n`
      : `${prefix} проверю официальные данные о погоде и курсах валют.\n\n`;
  }
  return language === 'tg'
    ? `${prefix} маълумоти заруриро месанҷам.\n\n`
    : `${prefix} проверю необходимые данные.\n\n`;
}
