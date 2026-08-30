export type NewsArticleImportance = 'critical' | 'high' | 'medium' | 'low';
export type NewsArticleSourceKind = 'official' | 'media';
export type NewsQuickKind = 'weather' | 'exchange' | 'alert' | 'emergency' | 'road' | 'finance';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  body: string[];
  source: string;
  sourceKind: NewsArticleSourceKind;
  category: string;
  region: string;
  city: string;
  importance: NewsArticleImportance;
  publishedAt: string;
  updatedAt: string;
  imageUrl: string;
  imageAlt: string;
  recommendationReason: string;
  tags: string[];
  isUrgent: boolean;
  recommended: boolean;
  originalUrl: string;
}

export interface NewsQuickCard {
  id: string;
  kind: NewsQuickKind;
  title: string;
  value: string;
  detail: string;
  meta: string;
  tone: 'blue' | 'amber' | 'red' | 'indigo';
  articleId?: string;
  sourceUrl?: string;
}

export interface NewsOverview {
  items: NewsArticle[];
  quick: NewsQuickCard[];
  updatedAt: string;
}

export async function fetchNewsOverview(signal?: AbortSignal, refresh = false): Promise<NewsOverview> {
  const response = await fetch(`/api/news-overview${refresh ? '?refresh=1' : ''}`, { signal });
  if (!response.ok) throw new Error(`Новости временно недоступны: HTTP ${response.status}`);
  const payload = await response.json() as Partial<NewsOverview>;
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    quick: Array.isArray(payload.quick) ? payload.quick : [],
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
  };
}
