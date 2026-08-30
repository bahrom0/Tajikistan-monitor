function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function normalizeIp(value) {
  return String(value || '')
    .split(',')[0]
    .trim()
    .slice(0, 128);
}

export function requestClientIp(req) {
  const forwarded = normalizeIp(headerValue(req?.headers, 'x-forwarded-for'));
  if (forwarded) return forwarded;

  const realIp = normalizeIp(headerValue(req?.headers, 'x-real-ip'));
  if (realIp) return realIp;

  return normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress) || 'local';
}
