const DEFAULT_BASE_URL = 'https://api.invertironline.com';

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function getConfig() {
  const baseUrl = (process.env.IOL_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const username = process.env.IOL_USERNAME;
  const password = process.env.IOL_PASSWORD;

  if (!username || !password) {
    throw new Error('Faltan IOL_USERNAME o IOL_PASSWORD en variables de entorno.');
  }

  return { baseUrl, username, password };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const msg = data?.message || data?.error_description || data?.error || response.statusText;
    const error = new Error(`IOL API error ${response.status}: ${msg}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export async function getAccessToken({ force = false } = {}) {
  const now = Date.now();

  if (!force && cachedToken && now < cachedTokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const { baseUrl, username, password } = getConfig();

  const body = new URLSearchParams();
  body.set('username', username);
  body.set('password', password);
  body.set('grant_type', 'password');

  const response = await fetch(`${baseUrl}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  });

  const data = await parseJsonResponse(response);

  if (!data.access_token) {
    throw new Error('La respuesta de token no trajo access_token.');
  }

  cachedToken = data.access_token;
  const expiresInSeconds = Number(data.expires_in || 900);
  cachedTokenExpiresAt = now + expiresInSeconds * 1000;

  return cachedToken;
}

export async function iolFetch(path, options = {}) {
  const { baseUrl } = getConfig();
  const makeRequest = async (token) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  let token = await getAccessToken();
  let response = await makeRequest(token);

  if (response.status === 401) {
    token = await getAccessToken({ force: true });
    response = await makeRequest(token);
  }

  return parseJsonResponse(response);
}

export async function getQuote({ market = 'BCBA', symbol }) {
  if (!symbol) {
    throw new Error('Falta symbol. Ejemplo: /api/quote?market=BCBA&symbol=GGAL');
  }

  // Endpoint usado históricamente por la API v2 de IOL.
  // Si IOL cambia la ruta o el nombre de mercado, ajustar acá.
  const safeMarket = encodeURIComponent(market);
  const safeSymbol = encodeURIComponent(symbol.toUpperCase());
  const path = `/api/v2/${safeMarket}/Titulos/${safeSymbol}/Cotizacion`;

  return iolFetch(path);
}

export async function getOptionsPanel({
  instrumento = 'Opciones',
  panel = 'Todas',
  pais = 'Argentina'
} = {}) {
  const safeInstrumento = encodeURIComponent(instrumento);
  const safePanel = encodeURIComponent(panel);
  const safePais = encodeURIComponent(pais);
  const path = `/api/v2/Cotizaciones/${safeInstrumento}/${safePanel}/${safePais}`;

  return iolFetch(path);
}

export async function getUnderlyingOptions({ market = 'BCBA', symbol }) {
  if (!symbol) {
    throw new Error('Falta symbol. Ejemplo: /api/options/GGAL?market=BCBA');
  }

  const safeMarket = encodeURIComponent(market);
  const safeSymbol = encodeURIComponent(symbol.toUpperCase());
  const path = `/api/v2/${safeMarket}/Titulos/${safeSymbol}/Opciones`;

  return iolFetch(path);
}

export async function getHistoricalQuotes({ market = 'BCBA', symbol, fechaDesde, fechaHasta, ajustada = 'sinAjustar' }) {
  if (!symbol) {
    throw new Error('Falta symbol. Ejemplo: /api/historical/GGAL?market=BCBA');
  }
  if (!fechaDesde || !fechaHasta) {
    throw new Error('Faltan fechaDesde o fechaHasta.');
  }

  const safeMarket = encodeURIComponent(market);
  const safeSymbol = encodeURIComponent(symbol.toUpperCase());
  const safeFechaDesde = encodeURIComponent(fechaDesde);
  const safeFechaHasta = encodeURIComponent(fechaHasta);
  const safeAjustada = encodeURIComponent(ajustada);
  const path = `/api/v2/${safeMarket}/Titulos/${safeSymbol}/Cotizacion/seriehistorica/${safeFechaDesde}/${safeFechaHasta}/${safeAjustada}`;

  return iolFetch(path);
}

export async function getPortfolio({ pais = 'Argentina' } = {}) {
  const safePais = encodeURIComponent(pais);
  const path = `/api/v2/portafolio/${safePais}`;

  return iolFetch(path);
}

export async function getOperations({
  estado = 'pendientes',
  pais = 'Argentina',
  fechaDesde,
  fechaHasta
} = {}) {
  const params = new URLSearchParams();
  params.set('filtro.estado', estado);
  params.set('filtro.pais', pais);
  if (fechaDesde) params.set('filtro.fechaDesde', fechaDesde);
  if (fechaHasta) params.set('filtro.fechaHasta', fechaHasta);

  return iolFetch(`/api/v2/operaciones?${params.toString()}`);
}
