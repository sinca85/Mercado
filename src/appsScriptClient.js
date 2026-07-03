function getAppsScriptConfig() {
  const url = process.env.GOOGLE_SHEET_APP_SCRIPT_URL;
  const token = process.env.GOOGLE_SHEET_API_TOKEN || '';

  if (!url) {
    throw new Error('Falta GOOGLE_SHEET_APP_SCRIPT_URL en variables de entorno.');
  }

  return { url, token };
}

async function parseAppsScriptResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data?.ok === false) {
    const msg = data?.error || response.statusText;
    const error = new Error(`Apps Script API error ${response.status}: ${msg}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function buildGetUrl(action, params = {}) {
  const { url, token } = getAppsScriptConfig();
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('action', action);

  if (token) requestUrl.searchParams.set('token', token);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      requestUrl.searchParams.set(key, String(value));
    }
  }

  return requestUrl;
}

export async function appsScriptGet(action, params = {}) {
  const requestUrl = buildGetUrl(action, params);
  const response = await fetch(requestUrl, { redirect: 'follow' });

  return parseAppsScriptResponse(response);
}

export async function appsScriptPost(body = {}) {
  const { url, token } = getAppsScriptConfig();
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      Accept: 'application/json'
    },
    body: JSON.stringify({ token, ...body })
  });

  return parseAppsScriptResponse(response);
}

export function listStrategySheets() {
  return appsScriptGet('list_sheets');
}

export function readStrategySheet({ sheet, range, mode = 'display' }) {
  if (!sheet || !range) {
    throw new Error('Faltan sheet o range. Ejemplo: /api/strategy-sheet/read?sheet=MD&range=A1:Y12');
  }

  return appsScriptGet('read', { sheet, range, mode });
}

export function getStrategySheetMetadata() {
  return appsScriptGet('metadata');
}

export function writeStrategySheet({ sheet, range, values }) {
  return appsScriptPost({ action: 'write', sheet, range, values });
}
