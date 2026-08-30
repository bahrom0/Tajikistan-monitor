const importanceMap = {
  critical: 'critical',
  warning: 'high',
  important: 'medium',
  info: 'low',
};

const safeArticleUrl = (value = '') => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

const articleImportance = (item) => importanceMap[item.importance] || (item.severity === 'alert' ? 'high' : 'low');

const locationContext = (item) => {
  const locations = item.locations || [];
  const city = locations.find((location) => location.locationType === 'city' || location.locationType === 'town');
  const region = locations.find((location) => location.locationType === 'region');
  const first = locations[0];
  return {
    city: city?.nameRu || first?.nameRu || 'Таджикистан',
    region: region?.nameRu || first?.nameRu || 'Республика Таджикистан',
  };
};

const unique = (values) => [...new Set(values.filter(Boolean))];

export function toNewsArticle(item, now = new Date()) {
  const importance = articleImportance(item);
  const location = locationContext(item);
  const publishedAt = item.publishedAt || now.toISOString();
  const recent = now.valueOf() - Date.parse(publishedAt) < 24 * 60 * 60 * 1000;
  const originalUrl = safeArticleUrl(item.url);
  const urgent = importance === 'critical' || item.severity === 'alert';
  const recommendationReason = urgent
    ? 'Официальное оперативное сообщение с повышенной важностью.'
    : `${recent ? 'Свежая' : 'Актуальная'} публикация источника «${item.sourceName}» по теме «${item.category}».`;
  return {
    id: item.id,
    title: item.title,
    summary: item.description || 'У источника нет краткого описания.',
    body: item.description ? [item.description] : [],
    source: item.sourceName,
    sourceKind: 'official',
    category: item.category || 'Другое',
    region: location.region,
    city: location.city,
    importance,
    publishedAt,
    updatedAt: publishedAt,
    imageUrl: item.imageUrl || '',
    imageAlt: item.imageAlt || item.title,
    recommendationReason,
    tags: unique([item.category, location.city, item.sourceName]).slice(0, 4),
    isUrgent: urgent,
    recommended: urgent || importance === 'high' || recent,
    originalUrl,
  };
}

const latestMatching = (items, predicate) => items.find(predicate);
const compact = (value, max = 72) => value.length <= max ? value : `${value.slice(0, max - 1).trim()}…`;

export function buildQuickNow({ items = [], weather = {}, rates = [] }) {
  const quick = [];
  const forecasts = weather.forecasts || [];
  const forecast = forecasts.find((item) => /душанбе/i.test(item.city)) || forecasts[0];
  if (forecast) {
    quick.push({
      id: 'weather', kind: 'weather', title: 'Погода', value: forecast.temperature,
      detail: forecast.city, meta: forecast.observedAt, tone: 'amber', sourceUrl: forecast.sourceUrl,
    });
  }

  const usd = [...rates]
    .filter((rate) => rate.code === 'USD')
    .sort((left, right) => Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt))[0];
  if (usd) {
    quick.push({
      id: 'exchange-usd', kind: 'exchange', title: 'Курс валют', value: Number(usd.rateTjs).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''),
      detail: `${usd.unit || 1} USD / TJS`, meta: usd.effectiveAt, tone: 'indigo', sourceUrl: usd.sourceUrl,
    });
  }

  const weatherAlert = [...(weather.alerts || [])].sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))[0];
  if (weatherAlert) {
    quick.push({
      id: `weather-alert-${weatherAlert.id}`, kind: 'alert', title: 'Метео Alert', value: 'Предупреждение',
      detail: compact(weatherAlert.text), meta: weatherAlert.publishedAt, tone: 'red', sourceUrl: weatherAlert.sourceUrl,
    });
  }

  const emergency = latestMatching(items, (item) => item.severity === 'alert' && (item.sourceId === 'kchs' || item.category === 'ЧС'));
  if (emergency) {
    quick.push({
      id: `emergency-${emergency.id}`, kind: 'emergency', title: 'ЧС', value: emergency.locations?.[0]?.nameRu || 'Таджикистан',
      detail: compact(emergency.title), meta: emergency.publishedAt, tone: 'red', articleId: emergency.id,
    });
  }

  const road = latestMatching(items, (item) => /транспорт|дорог/i.test(`${item.category} ${item.title}`));
  if (road && road.id !== emergency?.id) {
    quick.push({
      id: `road-${road.id}`, kind: 'road', title: 'Дороги', value: road.locations?.[0]?.nameRu || 'Таджикистан',
      detail: compact(road.title), meta: road.publishedAt, tone: road.severity === 'alert' ? 'red' : 'blue', articleId: road.id,
    });
  }

  const finance = latestMatching(items, (item) => Boolean(item.title?.trim()) && /финанс|эконом/i.test(item.category || ''));
  if (finance) {
    quick.push({
      id: `finance-${finance.id}`, kind: 'finance', title: 'Экономика', value: finance.sourceName,
      detail: compact(finance.title), meta: finance.publishedAt, tone: 'blue', articleId: finance.id,
    });
  }
  return quick.slice(0, 7);
}

export function buildNewsOverview(data, now = new Date()) {
  return {
    items: data.items.map((item) => toNewsArticle(item, now)),
    quick: buildQuickNow(data),
    sources: data.statuses,
    updatedAt: now.toISOString(),
  };
}
