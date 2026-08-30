import { handleRequest } from '../server/index.mjs';

function restorePublicPath(req) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = requestUrl.searchParams.get('__tm_path');
  if (path === null) return;

  requestUrl.searchParams.delete('__tm_path');
  const publicPath = path ? `/api/${path.replace(/^\/+/, '')}` : '/api';
  const query = requestUrl.searchParams.toString();
  Object.defineProperty(req, 'url', {
    configurable: true,
    value: `${publicPath}${query ? `?${query}` : ''}`,
  });
}

export default async function handler(req, res) {
  restorePublicPath(req);
  return handleRequest(req, res);
}
