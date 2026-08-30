const TOOL_NAMES = new Map([
  ['searchnews', 'search_news'],
  ['searchwebexa', 'search_web_exa'],
  ['getrecentnews', 'get_recent_news'],
  ['getlocationinfo', 'get_location_info'],
  ['getweatherandrates', 'get_weather_and_rates'],
  ['researchplace', 'research_place'],
]);

const TOOL_MARKER_RE = /<\s*(?:[|/]\s*)*(?:DSML\b|[｜|]\s*tool\s*calls?\s*[｜|]|tool_call\b|function_call\b|invoke\s+name\s*=)/i;
const MAX_TEXT_TOOL_CALLS = 4;
const MAX_TOOL_ARGUMENT_BYTES = 8_000;

export function normalizeToolName(name) {
  const clean = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return TOOL_NAMES.get(clean) || clean;
}

function normalizeArgumentName(name) {
  const compact = String(name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (compact === 'q' || compact === 'query' || compact === 'keywords' || compact === 'searchquery') return 'query';
  if (compact === 'location' || compact === 'locationid') return 'location_id';
  if (compact === 'locationquery') return 'location_query';
  if (compact === 'perioddays') return 'period_days';
  if (compact === 'numresults') return 'num_results';
  return String(name || '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

export function normalizeToolArguments(toolName, rawArgs) {
  const source = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};
  const normalized = {};
  for (const [rawName, rawValue] of Object.entries(source)) {
    const name = normalizeArgumentName(rawName);
    normalized[name] = typeof rawValue === 'string' ? coerceArgument(name, rawValue) : rawValue;
  }

  if (toolName === 'search_news' && !normalized.query && normalized.location_id) {
    normalized.query = String(normalized.location_id);
  }
  return normalized;
}

function coerceArgument(name, value) {
  const cleanValue = String(value ?? '').trim();
  if (['limit', 'period_days', 'num_results'].includes(name) && /^\d+$/.test(cleanValue)) {
    return Number(cleanValue);
  }
  return cleanValue;
}

function canonicalizeDsmlTags(text) {
  return text.replace(/<([^<>]*\bDSML\b[^<>]*)>/gi, (_tag, rawInner) => {
    let inner = String(rawInner).replace(/[|｜]/g, ' ').trim();
    const hadLeadingSlash = inner.startsWith('/');
    inner = inner.replace(/^[\s/]+/, '').replace(/\bDSML\b/i, '').trim();
    inner = inner.replace(/^[\s/]+/, '').replace(/\s+/g, ' ');

    const kindMatch = inner.match(/^(toolcalls?|invoke|parameter)\b/i);
    if (!kindMatch) return '';
    const rawKind = kindMatch[1].toLowerCase();
    const kind = rawKind === 'toolcall' ? 'toolcalls' : rawKind;
    const attributes = inner.slice(kindMatch[0].length).trim();
    // Some providers put slash decorations even on opening invoke/parameter
    // tags. Presence of a name attribute is the reliable discriminator there.
    const isClosing = kind === 'toolcalls'
      ? hadLeadingSlash
      : !/\bname\s*=/i.test(attributes);
    return `<${isClosing ? '/' : ''}dsml-${kind}${attributes ? ` ${attributes}` : ''}>`;
  });
}

function pushToolCall(toolCalls, name, args, idPrefix) {
  if (!name || toolCalls.length >= MAX_TEXT_TOOL_CALLS) return;
  const argumentsText = typeof args === 'string' ? args : JSON.stringify(args || {});
  if (Buffer.byteLength(argumentsText, 'utf8') > MAX_TOOL_ARGUMENT_BYTES) return;
  toolCalls.push({
    id: `call_${idPrefix}_${Date.now()}_${toolCalls.length}`,
    name: normalizeToolName(name),
    arguments: argumentsText,
  });
}

export function parseTextToolCalls(text) {
  const source = String(text || '');
  const toolCalls = [];
  if (!source) return { toolCalls, cleanText: '' };

  const canonical = canonicalizeDsmlTags(source);
  let cleanText = canonical;
  let match;

  const dsmlBlockRegex = /<dsml-toolcalls\b[^>]*>([\s\S]*?)<\/dsml-toolcalls>/gi;
  while ((match = dsmlBlockRegex.exec(canonical)) !== null) {
    cleanText = cleanText.replace(match[0], '');
    const invokeRegex = /<dsml-invoke\s+[^>]*name=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/dsml-invoke>/gi;
    let invokeMatch;
    while ((invokeMatch = invokeRegex.exec(match[1])) !== null) {
      const args = {};
      const parameterRegex = /<dsml-parameter\s+[^>]*name=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/dsml-parameter>/gi;
      let parameterMatch;
      while ((parameterMatch = parameterRegex.exec(invokeMatch[2])) !== null) {
        const argumentName = normalizeArgumentName(parameterMatch[1]);
        args[argumentName] = coerceArgument(argumentName, parameterMatch[2]);
      }
      const toolName = normalizeToolName(invokeMatch[1]);
      pushToolCall(toolCalls, toolName, normalizeToolArguments(toolName, args), 'dsml');
    }
  }

  const xmlToolRegex = /<tool_call\b[^>]*>([\s\S]*?)<\/tool_call>/gi;
  while ((match = xmlToolRegex.exec(canonical)) !== null) {
    cleanText = cleanText.replace(match[0], '');
    try {
      const parsed = JSON.parse(match[1].trim());
      pushToolCall(toolCalls, parsed.name, parsed.arguments || {}, 'xml');
    } catch {}
  }

  const deepseekRegex = /<[｜|]\s*tool\s*calls?\s*[｜|]>([\s\S]*?)<[｜|]\s*\/tool\s*calls?\s*[｜|]>/gi;
  while ((match = deepseekRegex.exec(canonical)) !== null) {
    cleanText = cleanText.replace(match[0], '');
    const callBlocks = match[1].split(/<[｜|]\s*tool\s*call\s*begin\s*[｜|]>/i).filter(Boolean);
    for (const block of callBlocks) {
      const parts = block.split(/<[｜|]\s*tool\s*sep\s*[｜|]>/i);
      if (parts.length < 2) continue;
      const name = parts[1].split(/\n|```/)[0].trim();
      const jsonMatch = block.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      pushToolCall(toolCalls, name, jsonMatch?.[1] || '{}', 'deepseek');
    }
  }

  cleanText = cleanText
    .replace(/<\/?dsml-(?:toolcalls?|invoke|parameter)\b[^>]*>/gi, '')
    .replace(/<[｜|][\s\S]*?[｜|]>/gi, '')
    .replace(/<\/?(?:tool_call|function_call|invoke|parameter)\b[^>]*>/gi, '')
    .trim();

  return { toolCalls, cleanText };
}

function couldBeToolMarker(fragment) {
  if (!fragment.startsWith('<')) return false;
  const compact = fragment
    .slice(1)
    .toLowerCase()
    .replace(/[\s|｜/]/g, '')
    .replace(/-/g, '_');
  return ['dsml', 'tool_call', 'function_call', 'invoke'].some(
    (marker) => marker.startsWith(compact) || compact.startsWith(marker)
  );
}

export function createToolMarkupStreamFilter(onText) {
  let buffer = '';
  let suppressed = false;

  return {
    feed(chunk) {
      if (!chunk) return;
      buffer += chunk;
      if (suppressed) return;

      const marker = buffer.search(TOOL_MARKER_RE);
      if (marker >= 0) {
        if (marker > 0) onText(buffer.slice(0, marker));
        buffer = buffer.slice(marker);
        suppressed = true;
        return;
      }

      const lastOpen = buffer.lastIndexOf('<');
      if (lastOpen >= 0 && couldBeToolMarker(buffer.slice(lastOpen))) {
        if (lastOpen > 0) onText(buffer.slice(0, lastOpen));
        buffer = buffer.slice(lastOpen);
        return;
      }

      onText(buffer);
      buffer = '';
    },
    flush() {
      if (!suppressed && buffer) onText(buffer);
      buffer = '';
    },
    get suppressed() {
      return suppressed;
    },
  };
}
