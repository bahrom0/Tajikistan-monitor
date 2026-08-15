export const sources = [
  { id: 'khovar-ru', name: 'НИАТ «Ховар»', kind: 'Новости', adapter: 'rss', url: 'https://khovar.tj/rus/feed/', interval: 300 },
  { id: 'khovar-tj', name: 'АМИТ «Ховар»', kind: 'Ахбор', adapter: 'rss', url: 'https://khovar.tj/feed/', interval: 300 },
  { id: 'statistics', name: 'Агентство статистики', kind: 'Статистика', adapter: 'rss', url: 'https://www.stat.tj/ru/category/news_ru/feed/', interval: 1800 },
  { id: 'kchs', name: 'КЧС Таджикистана', kind: 'ЧС', adapter: 'kchs', url: 'https://www.kchs.tj/', interval: 300 },
  { id: 'meteo', name: 'Агентство по гидрометеорологии', kind: 'Погода', adapter: 'meteo', url: 'https://meteo.tj/ru', interval: 900 },
  { id: 'nbt-news', name: 'Национальный банк — новости', kind: 'Финансы', adapter: 'nbt-news', url: 'https://nbt.tj/ru/news/', interval: 1800 },
  { id: 'nbt-rates', name: 'Национальный банк — курсы', kind: 'Курсы валют', adapter: 'nbt-rates', url: 'https://nbt.tj/ru/kurs/kurs.php', interval: 1800 },
];

export const referenceSources = [];
