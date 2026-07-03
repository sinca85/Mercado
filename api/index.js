import app from '../src/server.js';

function normalizeVercelRewriteUrl(req) {
  const rawPath = req.query?.path;
  if (!rawPath) return;

  const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }

  req.url = `/${path}${params.toString() ? `?${params.toString()}` : ''}`;
}

export default function handler(req, res) {
  normalizeVercelRewriteUrl(req);
  return app(req, res);
}
