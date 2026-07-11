const MULTIPLIER = 100;
const DEFAULT_RISK_FREE_RATE = 0.125;
const DEFAULT_VOLATILITY = 0.4;
const OPTION_COMMISSION = 0.005;
const MARKET_FEE = 0.002;
const VAT = 1.21;

const ROOT_TO_UNDERLYING = {
  GFG: { symbol: 'GGAL', name: 'Grupo Financiero Galicia' },
  GFC: { symbol: 'GGAL', name: 'Grupo Financiero Galicia' },
  GFA: { symbol: 'GGAL', name: 'Grupo Financiero Galicia' },
  YPF: { symbol: 'YPFD', name: 'YPF' },
  PAMP: { symbol: 'PAMP', name: 'Pampa Energia' },
  COME: { symbol: 'COME', name: 'Sociedad Comercial del Plata' },
  COM: { symbol: 'COME', name: 'Sociedad Comercial del Plata' },
  CRES: { symbol: 'CRES', name: 'Cresud' },
  CRE: { symbol: 'CRES', name: 'Cresud' },
  EDN: { symbol: 'EDN', name: 'Edenor' },
  TXAR: { symbol: 'TXAR', name: 'Ternium Argentina' },
  TXA: { symbol: 'TXAR', name: 'Ternium Argentina' },
  TRAN: { symbol: 'TRAN', name: 'Transener' },
  TRA: { symbol: 'TRAN', name: 'Transener' },
  TGS: { symbol: 'TGSU2', name: 'Transportadora de Gas del Sur' },
  BMA: { symbol: 'BMA', name: 'Banco Macro' },
  BYM: { symbol: 'BYMA', name: 'BYMA' },
  CEC: { symbol: 'CECO2', name: 'Central Costanera' },
  CEP: { symbol: 'CEPU', name: 'Central Puerto' },
  LOM: { symbol: 'LOMA', name: 'Loma Negra' },
  MET: { symbol: 'METR', name: 'Metrogas' },
  MIR: { symbol: 'MIRG', name: 'Mirgor' },
  PAM: { symbol: 'PAMP', name: 'Pampa Energia' },
  TEC: { symbol: 'TECO2', name: 'Telecom Argentina' },
  ALU: { symbol: 'ALUA', name: 'Aluar' },
  SUP: { symbol: 'SUPV', name: 'Grupo Supervielle' }
};

const MONTH_CODE_TO_MONTH = {
  EN: 0,
  FE: 1,
  MR: 2,
  AB: 3,
  MY: 4,
  JN: 5,
  JL: 6,
  L: 6,
  AG: 7,
  G: 7,
  SE: 8,
  OC: 9,
  O: 9,
  NO: 10,
  DI: 11
};

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function cleanSymbol(value) {
  return String(value || '').toUpperCase().replace(/\s+-\s+.*$/, '').replace(/\s/g, '');
}

export function numberValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value).trim();
    if (!raw) continue;
    const hasComma = raw.includes(',');
    const hasDot = raw.includes('.');
    let normalized = raw;
    if (hasComma) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
      const dotParts = raw.split('.');
      if (dotParts.length > 2) {
        normalized = raw.replace(/\./g, '');
      } else {
        const [integerPart, decimalPart = ''] = dotParts;
        const looksLikeThousands = integerPart.length <= 2 && decimalPart.length === 3;
        normalized = looksLikeThousands ? raw.replace(/\./g, '') : raw;
      }
    }
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export function parseOptionSymbol(rawSymbol) {
  const symbol = cleanSymbol(rawSymbol);
  const match = symbol.match(/^([A-Z]{2,5})([CV])(\d+(?:[.,]\d+)?)(?:\.?)([A-Z]{1,2})?/);
  if (!match) {
    return { symbol, root: symbol.slice(0, 4), optionType: null, strike: null, monthCode: null };
  }

  return {
    symbol,
    root: match[1],
    optionType: match[2] === 'C' ? 'CALL' : 'PUT',
    strike: Number(String(match[3]).replace(',', '.')),
    monthCode: match[4] || null
  };
}

function getItems(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.titulos)) return data.titulos;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function thirdFriday(year, monthIndex) {
  const date = new Date(Date.UTC(year, monthIndex, 1, 12));
  let fridayCount = 0;
  while (date.getUTCMonth() === monthIndex) {
    if (date.getUTCDay() === 5) {
      fridayCount += 1;
      if (fridayCount === 3) return date;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function expirationFromMonthCode(monthCode, now = new Date()) {
  const monthIndex = MONTH_CODE_TO_MONTH[monthCode || ''];
  if (monthIndex === undefined) return null;
  let year = now.getUTCFullYear();
  let expiration = thirdFriday(year, monthIndex);
  if (expiration.getTime() < now.getTime() - 86400000) {
    expiration = thirdFriday(year + 1, monthIndex);
    year += 1;
  }
  return { date: expiration.toISOString().slice(0, 10), year, label: MONTH_LABELS[monthIndex] };
}

function optionPriceForMark(option) {
  return numberValue(option?.last, option?.ask, option?.bid, 0) || 0;
}

export function normalizeOptionsPanel(payload, { now = new Date() } = {}) {
  return getItems(payload).map((item, index) => {
    if (item.symbol && item.optionType && item.underlying) return item;
    const parsed = parseOptionSymbol(item.simbolo || item.symbol);
    const rootInfo = ROOT_TO_UNDERLYING[parsed.root] || {};
    const underlying = String(item.simboloSubyacente || item.subyacente || rootInfo.symbol || parsed.root || 'OTROS').toUpperCase();
    const expirationInfo = item.fechaVencimiento
      ? { date: String(item.fechaVencimiento).slice(0, 10), label: null }
      : expirationFromMonthCode(parsed.monthCode, now);
    const bid = numberValue(item.puntas?.precioCompra, item.precioCompra);
    const ask = numberValue(item.puntas?.precioVenta, item.precioVenta);

    return {
      key: `${parsed.symbol}-${index}`,
      symbol: parsed.symbol,
      description: item.descripcion || parsed.symbol,
      underlying,
      underlyingName: rootInfo.name || underlying,
      root: parsed.root,
      optionType: parsed.optionType || (String(item.tipoOpcion || '').toUpperCase().includes('PUT') ? 'PUT' : 'CALL'),
      strike: numberValue(item.precioEjercicio, item.strike, parsed.strike),
      monthCode: parsed.monthCode,
      expiration: expirationInfo?.date || null,
      expirationLabel: expirationInfo?.label || parsed.monthCode || '-',
      bid,
      ask,
      bidSize: numberValue(item.puntas?.cantidadCompra, item.cantidadCompra, 0) || 0,
      askSize: numberValue(item.puntas?.cantidadVenta, item.cantidadVenta, 0) || 0,
      last: numberValue(item.ultimoPrecio, item.last, 0) || 0,
      changePercent: numberValue(item.variacionPorcentual, item.changePercent, 0) || 0,
      volume: numberValue(item.volumen, 0) || 0,
      market: item.mercado || 'BCBA',
      currency: item.moneda || 'AR$',
      raw: item
    };
  }).filter((option) => option.symbol && option.strike !== null);
}

export function groupOptionChains(options) {
  const groups = new Map();

  for (const option of options) {
    const key = `${option.underlying}-${option.monthCode || option.expiration || 'SIN'}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        underlying: option.underlying,
        underlyingName: option.underlyingName,
        monthCode: option.monthCode,
        expiration: option.expiration,
        expirationLabel: option.expirationLabel,
        calls: [],
        puts: []
      });
    }
    const group = groups.get(key);
    if (option.optionType === 'PUT') group.puts.push(option);
    else group.calls.push(option);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    calls: group.calls.sort((a, b) => a.strike - b.strike),
    puts: group.puts.sort((a, b) => a.strike - b.strike)
  })).sort((a, b) => `${a.underlying}-${a.expirationLabel}`.localeCompare(`${b.underlying}-${b.expirationLabel}`));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function normalPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function blackScholes({ type, spot, strike, years, volatility = DEFAULT_VOLATILITY, rate = DEFAULT_RISK_FREE_RATE }) {
  if (!(spot > 0) || !(strike > 0) || !(years > 0) || !(volatility > 0)) {
    const intrinsic = type === 'PUT' ? Math.max(strike - spot, 0) : Math.max(spot - strike, 0);
    return { price: intrinsic, delta: type === 'PUT' ? (spot < strike ? -1 : 0) : (spot > strike ? 1 : 0), gamma: 0, vega: 0, theta: 0 };
  }

  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (volatility * volatility) / 2) * years) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;
  const discount = Math.exp(-rate * years);
  const isPut = type === 'PUT';
  const price = isPut
    ? strike * discount * normalCdf(-d2) - spot * normalCdf(-d1)
    : spot * normalCdf(d1) - strike * discount * normalCdf(d2);
  const delta = isPut ? normalCdf(d1) - 1 : normalCdf(d1);
  const gamma = normalPdf(d1) / (spot * volatility * sqrtT);
  const vega = spot * sqrtT * normalPdf(d1) / 100;
  const theta = isPut
    ? (-(spot * normalPdf(d1) * volatility) / (2 * sqrtT) + rate * strike * discount * normalCdf(-d2)) / 365
    : (-(spot * normalPdf(d1) * volatility) / (2 * sqrtT) - rate * strike * discount * normalCdf(d2)) / 365;

  return { price, delta, gamma, vega, theta, d1, d2 };
}

export function impliedVolatility({ targetPrice, type, spot, strike, years, rate = DEFAULT_RISK_FREE_RATE }) {
  if (!(targetPrice > 0) || !(spot > 0) || !(strike > 0) || !(years > 0)) return null;
  let low = 0.0001;
  let high = 5;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const { price } = blackScholes({ type, spot, strike, years, volatility: mid, rate });
    if (Math.abs(price - targetPrice) < 0.001) return mid;
    if (price > targetPrice) high = mid;
    else low = mid;
  }

  return (low + high) / 2;
}

function getYearsToExpiration(expiration) {
  if (!expiration) return 50 / 365;
  const expiry = new Date(`${expiration}T21:00:00.000Z`);
  const days = Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / 86400000));
  return days / 365;
}

function estimateSpot(options, requestedSpot) {
  const explicit = numberValue(requestedSpot);
  if (explicit && explicit > 0) return explicit;

  const active = options.filter((option) => option.last > 0 || option.bid > 0 || option.ask > 0);
  if (!active.length) return null;
  const strikes = active.map((option) => option.strike).filter((value) => value > 0).sort((a, b) => a - b);
  return strikes[Math.floor(strikes.length / 2)] || null;
}

function findContract(optionsBySymbol, leg) {
  const symbol = cleanSymbol(leg.symbol || leg.base);
  return optionsBySymbol.get(symbol) || null;
}

function legCurrentPrice(leg, contract) {
  const manual = numberValue(leg.manualPrice);
  if (manual !== null) return manual;
  if (!contract) return 0;
  return optionPriceForMark(contract);
}

function optionPayoff(type, spot, strike) {
  return type === 'PUT' ? Math.max(strike - spot, 0) : Math.max(spot - strike, 0);
}

export function calculateStrategy({
  strategy,
  options,
  underlyingSpot,
  riskFreeRate = DEFAULT_RISK_FREE_RATE,
  volatility = DEFAULT_VOLATILITY,
  useAutoIv = false
}) {
  const optionList = Array.isArray(options) ? options : [];
  const optionsBySymbol = new Map(optionList.map((option) => [cleanSymbol(option.symbol), option]));
  const spot = estimateSpot(optionList, underlyingSpot);
  const strategyLegs = Array.isArray(strategy.legs) ? strategy.legs : [];
  const historyLegs = Array.isArray(strategy.history) ? strategy.history.map((leg) => ({ ...leg, source: 'history' })) : [];
  const activeLegs = [...strategyLegs, ...historyLegs].filter((leg) => {
    const type = String(leg.type || '').toUpperCase();
    const hasInstrument = type === 'ACC' || cleanSymbol(leg.symbol || leg.base);
    return numberValue(leg.quantity) !== null && hasInstrument;
  });
  const feeFactor = (OPTION_COMMISSION + MARKET_FEE) * VAT;

  const legs = activeLegs.map((leg, index) => {
    const type = String(leg.type || 'CALL').toUpperCase();
    const contract = type === 'ACC' ? null : findContract(optionsBySymbol, leg);
    const quantity = numberValue(leg.quantity, 0) || 0;
    const strike = numberValue(leg.strike, contract?.strike, 0) || 0;
    const currentPrice = type === 'ACC' ? (spot || 0) : legCurrentPrice(leg, contract);
    const premium = leg.source === 'history'
      ? numberValue(leg.premium, 0) || 0
      : numberValue(leg.manualPrice, currentPrice, leg.premium, 0) || 0;
    const realized = numberValue(leg.realized, 0) || 0;
    const multiplier = type === 'ACC' ? 1 : MULTIPLIER;
    const gross = quantity * premium * -multiplier;
    const netBeforeRealized = type === 'ACC'
      ? quantity * premium * -multiplier
      : quantity > 0
      ? quantity * premium * (1 + feeFactor) * -MULTIPLIER
      : quantity * premium * (1 - feeFactor) * -MULTIPLIER;
    const net = netBeforeRealized + realized;
    const currentValue = currentPrice * quantity * -multiplier;
    const todayResult = net - currentValue;
    const years = getYearsToExpiration(contract?.expiration || strategy.expiration);
    const iv = type === 'ACC' ? null : impliedVolatility({ targetPrice: currentPrice, type, spot: spot || strike, strike, years, rate: riskFreeRate });
    const legVolatility = useAutoIv && iv ? iv : volatility;
    const theoretical = type === 'ACC'
      ? { price: spot || 0, delta: 1, gamma: 0, vega: 0, theta: 0 }
      : blackScholes({ type, spot: spot || strike, strike, years, volatility: legVolatility, rate: riskFreeRate });

    return {
      id: leg.id || `leg-${index + 1}`,
      type,
      quantity,
      source: leg.source || 'strategy',
      symbol: cleanSymbol(leg.symbol || leg.base),
      strike,
      premium,
      currentPrice,
      gross,
      net,
      currentValue,
      todayResult,
      contract,
      theoreticalPrice: theoretical.price,
      impliedVolatility: iv,
      greeks: {
        delta: theoretical.delta * quantity * multiplier,
        gamma: theoretical.gamma * quantity * multiplier,
        vega: theoretical.vega * quantity * multiplier,
        theta: theoretical.theta * quantity * multiplier
      }
    };
  });

  const strikes = optionList.map((option) => option.strike).filter((value) => value > 0);
  const minStrike = Math.min(...strikes, spot || 0);
  const maxStrike = Math.max(...strikes, spot || 0);
  const minScenario = Math.max(0, Math.floor((minStrike * 0.8) / 100) * 100);
  const maxScenario = Math.ceil((maxStrike * 1.2) / 100) * 100;
  const step = Math.max(10, Math.round(((maxScenario - minScenario) / 40) / 10) * 10);
  const scenarios = [];

  function finishAt(price) {
    return legs.reduce((sum, leg) => {
      if (leg.type === 'ACC') return sum + leg.net + price * leg.quantity;
      const payoff = optionPayoff(leg.type, price, leg.strike);
      return sum + leg.net + payoff * leg.quantity * MULTIPLIER;
    }, 0);
  }

  function theoreticalAt(price) {
    return legs.reduce((sum, leg) => {
      if (leg.type === 'ACC') return sum + leg.net + price * leg.quantity;
      const years = getYearsToExpiration(leg.contract?.expiration || strategy.expiration);
      const theoretical = blackScholes({
        type: leg.type,
        spot: price,
        strike: leg.strike,
        years,
        volatility: useAutoIv && leg.impliedVolatility ? leg.impliedVolatility : volatility,
        rate: riskFreeRate
      });
      return sum + leg.net + theoretical.price * leg.quantity * MULTIPLIER;
    }, 0);
  }

  for (let price = minScenario; price <= maxScenario; price += step) {
    scenarios.push({ underlyingPrice: price, finish: finishAt(price), theoretical: theoreticalAt(price) });
  }

  const percentScenarios = [];
  if (spot) {
    for (let percent = -30; percent <= 30; percent += 2) {
      const underlyingPrice = spot * (1 + percent / 100);
      percentScenarios.push({
        percent,
        underlyingPrice,
        finish: finishAt(underlyingPrice),
        theoretical: theoreticalAt(underlyingPrice)
      });
    }
  }

  const summary = legs.reduce((acc, leg) => {
    acc.gross += leg.gross;
    acc.net += leg.net;
    acc.currentValue += leg.currentValue;
    acc.todayResult += leg.todayResult;
    acc.delta += leg.greeks.delta;
    acc.gamma += leg.greeks.gamma;
    acc.vega += leg.greeks.vega;
    acc.theta += leg.greeks.theta;
    return acc;
  }, { gross: 0, net: 0, currentValue: 0, todayResult: 0, delta: 0, gamma: 0, vega: 0, theta: 0 });

  return {
    spot,
    multiplier: MULTIPLIER,
    assumptions: { riskFreeRate, volatility, useAutoIv, optionCommission: OPTION_COMMISSION, marketFee: MARKET_FEE, vat: VAT },
    legs,
    summary,
    scenarios,
    percentScenarios
  };
}

export function buildOptionChainResponse(panel, { underlying, monthCode, spot } = {}) {
  const normalized = normalizeOptionsPanel(panel);
  const filtered = normalized.filter((option) => {
    const underlyingOk = !underlying || option.underlying === String(underlying).toUpperCase();
    const monthOk = !monthCode || option.monthCode === String(monthCode).toUpperCase();
    return underlyingOk && monthOk;
  });
  const estimatedSpot = estimateSpot(filtered, spot);
  const enriched = filtered.map((option) => {
    const years = getYearsToExpiration(option.expiration);
    const mark = optionPriceForMark(option);
    const theoretical = estimatedSpot
      ? blackScholes({ type: option.optionType, spot: estimatedSpot, strike: option.strike, years, volatility: DEFAULT_VOLATILITY, rate: DEFAULT_RISK_FREE_RATE })
      : null;
    const iv = estimatedSpot
      ? impliedVolatility({ targetPrice: mark, type: option.optionType, spot: estimatedSpot, strike: option.strike, years, rate: DEFAULT_RISK_FREE_RATE })
      : null;

    return {
      ...option,
      mark,
      theoreticalPrice: theoretical?.price ?? null,
      impliedVolatility: iv,
      greeks: theoretical ? {
        delta: theoretical.delta,
        gamma: theoretical.gamma,
        vega: theoretical.vega,
        theta: theoretical.theta
      } : null
    };
  });

  return {
    spot: estimatedSpot,
    options: enriched,
    chains: groupOptionChains(enriched)
  };
}
