import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';
import {
  getStrategySheetMetadata,
  listStrategySheets,
  readStrategySheet,
  writeStrategySheet
} from './appsScriptClient.js';
import {
  getAccessToken,
  getOperations,
  getOptionsPanel,
  getPortfolio,
  getQuote,
  getUnderlyingOptions
} from './iolClient.js';
import { buildOptionChainResponse, calculateStrategy, normalizeOptionsPanel, numberValue } from './optionsEngine.js';
import { createStrategy, getStrategy, updateStrategy } from './strategyStore.js';
import { getCachedMarketData, isMarketOpen, marketCacheStatus } from './marketDataCache.js';

const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const AUTO_REFRESH_UNDERLYINGS = (process.env.MARKET_CACHE_UNDERLYINGS || 'GGAL,YPFD,COME,PAMP,BMA,ALUA,SUPV')
  .split(',')
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

function sendError(res, error) {
  console.error(error);
  res.status(error.status || 500).json({
    ok: false,
    error: error.message,
    payload: error.payload || null
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'iol-market-data-lab', marketCache: marketCacheStatus() });
});

app.get('/api/token-test', async (_req, res) => {
  try {
    const token = await getAccessToken({ force: true });
    res.json({
      ok: true,
      tokenPreview: `${token.slice(0, 8)}...${token.slice(-8)}`,
      note: 'Token obtenido correctamente. No se devuelve completo por seguridad.'
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/quote', async (req, res) => {
  try {
    const market = String(req.query.market || 'BCBA');
    const symbol = String(req.query.symbol || '').trim();
    const force = req.query.force === '1' || req.query.force === 'true';
    const { data, cache } = await getCachedMarketData({
      key: `quote:${market}:${symbol.toUpperCase()}`,
      kind: 'quote',
      force,
      loader: () => getQuote({ market, symbol })
    });

    res.json({
      ok: true,
      requested: { market, symbol: symbol.toUpperCase() },
      receivedAt: new Date().toISOString(),
      cache,
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/options', async (req, res) => {
  try {
    const instrumento = String(req.query.instrumento || 'Opciones');
    const panel = String(req.query.panel || 'Todas');
    const pais = String(req.query.pais || 'Argentina');
    const force = req.query.force === '1' || req.query.force === 'true';
    const { data, cache } = await getCachedMarketData({
      key: `options-panel:${instrumento}:${panel}:${pais}`,
      kind: 'options-panel',
      force,
      loader: () => getOptionsPanel({ instrumento, panel, pais })
    });

    res.json({
      ok: true,
      requested: { instrumento, panel, pais },
      receivedAt: new Date().toISOString(),
      cache,
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/options/:symbol', async (req, res) => {
  try {
    const market = String(req.query.market || 'BCBA');
    const symbol = String(req.params.symbol || '').trim();
    const data = await getUnderlyingOptions({ market, symbol });

    res.json({
      ok: true,
      requested: { market, symbol: symbol.toUpperCase() },
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/option-chains', async (req, res) => {
  try {
    const instrumento = String(req.query.instrumento || 'Opciones');
    const panel = String(req.query.panel || 'Todas');
    const pais = String(req.query.pais || 'Argentina');
    const underlying = req.query.underlying ? String(req.query.underlying).toUpperCase() : undefined;
    const monthCode = req.query.monthCode ? String(req.query.monthCode).toUpperCase() : undefined;
    const spot = req.query.spot ? Number(req.query.spot) : undefined;
    const force = req.query.force === '1' || req.query.force === 'true';
    const { data, cache } = await getCachedMarketData({
      key: `options-panel:${instrumento}:${panel}:${pais}`,
      kind: 'options-panel',
      force,
      loader: () => getOptionsPanel({ instrumento, panel, pais })
    });
    const chain = buildOptionChainResponse(data, { underlying, monthCode, spot });

    res.json({
      ok: true,
      requested: { instrumento, panel, pais, underlying, monthCode, spot },
      receivedAt: new Date().toISOString(),
      cache,
      data: chain
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const pais = String(req.query.pais || 'Argentina');
    const data = await getPortfolio({ pais });

    res.json({
      ok: true,
      requested: { pais },
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const estado = String(req.query.estado || 'pendientes');
    const pais = String(req.query.pais || 'Argentina');
    const fechaDesde = req.query.fechaDesde ? String(req.query.fechaDesde) : undefined;
    const fechaHasta = req.query.fechaHasta ? String(req.query.fechaHasta) : undefined;
    const data = await getOperations({ estado, pais, fechaDesde, fechaHasta });

    res.json({
      ok: true,
      requested: { estado, pais, fechaDesde, fechaHasta },
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/strategy-sheet/metadata', async (_req, res) => {
  try {
    const data = await getStrategySheetMetadata();
    res.json({
      ok: true,
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/strategy-sheet/sheets', async (_req, res) => {
  try {
    const data = await listStrategySheets();
    res.json({
      ok: true,
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/strategy-sheet/read', async (req, res) => {
  try {
    const sheet = String(req.query.sheet || '');
    const range = String(req.query.range || '');
    const mode = String(req.query.mode || 'display');
    const data = await readStrategySheet({ sheet, range, mode });

    res.json({
      ok: true,
      requested: { sheet, range, mode },
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/strategy-sheet/write', async (req, res) => {
  try {
    const { sheet, range, values } = req.body || {};
    const data = await writeStrategySheet({ sheet, range, values });

    res.json({
      ok: true,
      requested: { sheet, range },
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

async function buildStrategyPayload(strategy, { forceMarketData = false } = {}) {
  const { data: panel, cache: panelCache } = await getCachedMarketData({
    key: 'options-panel:Opciones:Todas:Argentina',
    kind: 'options-panel',
    force: forceMarketData,
    loader: () => getOptionsPanel({ instrumento: 'Opciones', panel: 'Todas', pais: 'Argentina' })
  });
  let quote = null;
  let quoteCache = null;
  try {
    const cachedQuote = await getCachedMarketData({
      key: `quote:BCBA:${strategy.underlying}`,
      kind: 'quote',
      force: forceMarketData,
      loader: () => getQuote({ market: 'BCBA', symbol: strategy.underlying })
    });
    quote = cachedQuote.data;
    quoteCache = cachedQuote.cache;
  } catch (error) {
    console.warn(`No se pudo obtener cotizacion de ${strategy.underlying}: ${error.message}`);
  }
  const spot = numberValue(strategy.spot, quote?.ultimoPrecio, quote?.ultimo, quote?.precio);
  const options = normalizeOptionsPanel(panel).filter((option) => {
    const underlyingOk = option.underlying === strategy.underlying;
    const monthOk = !strategy.monthCode || option.monthCode === strategy.monthCode;
    return underlyingOk && monthOk;
  });
  const calculation = calculateStrategy({
    strategy,
    options,
    underlyingSpot: spot,
    riskFreeRate: strategy.riskFreeRate,
    volatility: strategy.volatility,
    useAutoIv: strategy.useAutoIv
  });

  return {
    strategy,
    chain: buildOptionChainResponse({ titulos: options }, {
      underlying: strategy.underlying,
      monthCode: strategy.monthCode,
      spot: calculation.spot
    }),
    quote,
    cache: {
      panel: panelCache,
      quote: quoteCache,
      status: marketCacheStatus()
    },
    calculation
  };
}

async function refreshMarketSnapshot() {
  if (process.env.MARKET_CACHE_AUTO_REFRESH === 'false' || !isMarketOpen()) return;

  try {
    await getCachedMarketData({
      key: 'options-panel:Opciones:Todas:Argentina',
      kind: 'options-panel',
      force: true,
      loader: () => getOptionsPanel({ instrumento: 'Opciones', panel: 'Todas', pais: 'Argentina' })
    });
    await Promise.all(AUTO_REFRESH_UNDERLYINGS.map((symbol) => getCachedMarketData({
      key: `quote:BCBA:${symbol}`,
      kind: 'quote',
      force: true,
      loader: () => getQuote({ market: 'BCBA', symbol })
    })));
    console.log(`Market cache actualizado: ${new Date().toISOString()}`);
  } catch (error) {
    console.warn(`No se pudo refrescar market cache: ${error.message}`);
  }
}

app.post('/api/strategies', async (req, res) => {
  try {
    const strategy = await createStrategy(req.body || {});
    const data = await buildStrategyPayload(strategy, { forceMarketData: req.query.force === '1' || req.query.force === 'true' });

    res.json({
      ok: true,
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/strategies/:id', async (req, res) => {
  try {
    const strategy = await getStrategy(String(req.params.id));
    if (!strategy) {
      return res.status(404).json({ ok: false, error: `No existe estrategia ${req.params.id}.` });
    }
    const data = await buildStrategyPayload(strategy, { forceMarketData: req.query.force === '1' || req.query.force === 'true' });

    res.json({
      ok: true,
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/strategies/:id', async (req, res) => {
  try {
    const strategy = await updateStrategy(String(req.params.id), req.body || {});
    const data = await buildStrategyPayload(strategy, { forceMarketData: req.query.force === '1' || req.query.force === 'true' });

    res.json({
      ok: true,
      receivedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/cotizaciones', (_req, res) => {
  res.sendFile(path.join(publicDir, 'cotizaciones.html'));
});

app.get(['/estrategias', '/estrategias/:id'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'estrategias.html'));
});

function startServer() {
  app.listen(port, () => {
    console.log(`IOL Market Data Lab escuchando en http://localhost:${port}`);
    const refreshMs = Math.max(1, Number(process.env.MARKET_CACHE_INTERVAL_MINUTES || 20)) * 60_000;
    setInterval(refreshMarketSnapshot, refreshMs).unref();
    refreshMarketSnapshot();
  });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) startServer();

export default app;
