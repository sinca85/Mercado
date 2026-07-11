import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'strategies.json');
const DEFAULT_STRATEGY_ROWS_PER_SIDE = 10;
const HISTORY_ROWS_PER_SIDE = 24;
const DEFAULT_DB_NAME = 'iol_market_data_lab';

let mongoClient = null;
let mongoCollection = null;
let mongoWarningShown = false;

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify({ strategies: {} }, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  return JSON.parse(raw || '{"strategies":{}}');
}

async function writeStore(store) {
  await ensureStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

async function strategiesCollection() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) return null;
  if (mongoCollection) return mongoCollection;

  try {
    mongoClient = mongoClient || new MongoClient(mongoUri);
    await mongoClient.connect();
    const db = mongoClient.db(process.env.MONGO_DB || process.env.MONGODB_DB || DEFAULT_DB_NAME);
    mongoCollection = db.collection('strategies');
    await mongoCollection.createIndex({ id: 1 }, { unique: true });
    return mongoCollection;
  } catch (error) {
    if (!mongoWarningShown) {
      console.warn(`Mongo strategies deshabilitado: ${error.message}`);
      mongoWarningShown = true;
    }
    return null;
  }
}

function makeId() {
  return crypto.randomBytes(4).toString('hex');
}

function makeDefaultLegs() {
  const calls = Array.from({ length: DEFAULT_STRATEGY_ROWS_PER_SIDE }, (_item, index) => ({
    id: `call-${index + 1}`,
    type: 'CALL',
    quantity: '',
    symbol: '',
    premium: '',
    manualPrice: ''
  }));
  const puts = Array.from({ length: DEFAULT_STRATEGY_ROWS_PER_SIDE }, (_item, index) => ({
    id: `put-${index + 1}`,
    type: 'PUT',
    quantity: '',
    symbol: '',
    premium: '',
    manualPrice: ''
  }));
  return [...calls, ...puts];
}

function normalizeLegs(inputLegs) {
  const incoming = Array.isArray(inputLegs) ? inputLegs : [];
  const byId = new Map(incoming.map((leg) => [leg.id, leg]));
  const legacyCalls = incoming.filter((leg) => String(leg.type || '').toUpperCase() === 'CALL' && !String(leg.id || '').startsWith('call-'));
  const legacyPuts = incoming.filter((leg) => String(leg.type || '').toUpperCase() === 'PUT' && !String(leg.id || '').startsWith('put-'));
  const callCount = Math.max(DEFAULT_STRATEGY_ROWS_PER_SIDE, incoming.filter((leg) => String(leg.type || '').toUpperCase() === 'CALL').length);
  const putCount = Math.max(DEFAULT_STRATEGY_ROWS_PER_SIDE, incoming.filter((leg) => String(leg.type || '').toUpperCase() === 'PUT').length);
  const fallback = [
    ...Array.from({ length: callCount }, (_item, index) => ({ id: `call-${index + 1}`, type: 'CALL', quantity: '', symbol: '', premium: '', manualPrice: '' })),
    ...Array.from({ length: putCount }, (_item, index) => ({ id: `put-${index + 1}`, type: 'PUT', quantity: '', symbol: '', premium: '', manualPrice: '' }))
  ];

  return fallback.map((emptyLeg, index) => {
    const legacy = emptyLeg.type === 'CALL' ? legacyCalls.shift() : legacyPuts.shift();
    const leg = byId.get(emptyLeg.id) || legacy || emptyLeg;
    return {
      id: emptyLeg.id,
      type: emptyLeg.type,
      quantity: leg.quantity ?? '',
      symbol: String(leg.symbol || leg.base || '').toUpperCase(),
      premium: leg.premium ?? '',
      manualPrice: leg.manualPrice ?? ''
    };
  });
}

function normalizeHistory(inputHistory) {
  const incoming = Array.isArray(inputHistory) ? inputHistory : [];
  const byType = {
    CALL: incoming.filter((item) => String(item.type || '').toUpperCase() === 'CALL'),
    PUT: incoming.filter((item) => String(item.type || '').toUpperCase() === 'PUT'),
    ACC: incoming.filter((item) => String(item.type || '').toUpperCase() === 'ACC')
  };
  const calls = Array.from({ length: Math.max(HISTORY_ROWS_PER_SIDE, byType.CALL.length) }, (_item, index) => {
    const item = byType.CALL[index] || {};
    return {
      id: item.id || `history-call-${index + 1}`,
      date: item.date || '',
      type: 'CALL',
      quantity: item.quantity ?? '',
      symbol: String(item.symbol || item.base || '').toUpperCase(),
      premium: item.premium ?? '',
      manualPrice: item.manualPrice ?? '',
      realized: item.realized ?? 0
    };
  });
  const puts = Array.from({ length: Math.max(HISTORY_ROWS_PER_SIDE, byType.PUT.length) }, (_item, index) => {
    const item = byType.PUT[index] || {};
    return {
      id: item.id || `history-put-${index + 1}`,
      date: item.date || '',
      type: 'PUT',
      quantity: item.quantity ?? '',
      symbol: String(item.symbol || item.base || '').toUpperCase(),
      premium: item.premium ?? '',
      manualPrice: item.manualPrice ?? '',
      realized: item.realized ?? 0
    };
  });
  const acc = byType.ACC.map((item, index) => ({
    id: item.id || `history-acc-${index + 1}`,
    date: item.date || '',
    type: 'ACC',
    quantity: item.quantity ?? '',
    symbol: String(item.symbol || item.base || '').toUpperCase(),
    premium: item.premium ?? '',
    manualPrice: item.manualPrice ?? '',
    realized: item.realized ?? 0
  }));
  return [...calls, ...puts, ...acc];
}

function normalizeStrategy(input = {}) {
  return {
    name: input.name || 'Estrategia sin nombre',
    underlying: String(input.underlying || 'GGAL').toUpperCase(),
    monthCode: String(input.monthCode || 'AG').toUpperCase(),
    expiration: input.expiration || null,
    spot: input.spot ?? null,
    targetSpot: input.targetSpot ?? null,
    riskFreeRate: input.riskFreeRate ?? 0.125,
    volatility: input.volatility ?? 0.4,
    useAutoIv: Boolean(input.useAutoIv),
    legs: normalizeLegs(input.legs),
    history: normalizeHistory(input.history)
  };
}

export async function createStrategy(input = {}) {
  const collection = await strategiesCollection();
  const store = collection ? null : await readStore();
  let id = makeId();
  while (collection ? await collection.findOne({ id }) : store.strategies[id]) id = makeId();

  const now = new Date().toISOString();
  const strategy = {
    id,
    ...normalizeStrategy(input),
    createdAt: now,
    updatedAt: now
  };

  if (collection) {
    await collection.insertOne(strategy);
  } else {
    store.strategies[id] = strategy;
    await writeStore(store);
  }
  return strategy;
}

export async function listStrategies() {
  const collection = await strategiesCollection();
  if (collection) {
    return collection
      .find({}, {
        projection: {
          _id: 0,
          id: 1,
          name: 1,
          underlying: 1,
          monthCode: 1,
          updatedAt: 1,
          createdAt: 1
        }
      })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();
  }

  const store = await readStore();
  return Object.values(store.strategies || {})
    .map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      underlying: strategy.underlying,
      monthCode: strategy.monthCode,
      updatedAt: strategy.updatedAt,
      createdAt: strategy.createdAt
    }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function getStrategy(id) {
  const collection = await strategiesCollection();
  if (collection) {
    const existing = await collection.findOne({ id }, { projection: { _id: 0 } });
    if (existing) {
      return {
        ...existing,
        ...normalizeStrategy(existing),
        id,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt
      };
    }
  }

  const store = await readStore();
  const existing = store.strategies[id];
  if (!existing) return null;
  const strategy = {
    ...existing,
    ...normalizeStrategy(existing),
    id,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt
  };

  if (collection) {
    await collection.updateOne({ id }, { $set: strategy }, { upsert: true });
  }

  return strategy;
}

export async function deleteStrategy(id) {
  const collection = await strategiesCollection();
  if (collection) {
    const result = await collection.deleteOne({ id });
    if (!result.deletedCount) {
      const error = new Error(`No existe estrategia ${id}.`);
      error.status = 404;
      throw error;
    }
    return { id };
  }

  const store = await readStore();
  if (!store.strategies[id]) {
    const error = new Error(`No existe estrategia ${id}.`);
    error.status = 404;
    throw error;
  }
  delete store.strategies[id];
  await writeStore(store);
  return { id };
}

export async function updateStrategy(id, input = {}) {
  const collection = await strategiesCollection();
  if (collection) {
    const existing = await collection.findOne({ id }, { projection: { _id: 0 } });
    if (!existing) {
      const error = new Error(`No existe estrategia ${id}.`);
      error.status = 404;
      throw error;
    }

    const strategy = {
      ...existing,
      ...normalizeStrategy({ ...existing, ...input }),
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    await collection.updateOne({ id }, { $set: strategy });
    return strategy;
  }

  const store = await readStore();
  const existing = store.strategies[id];
  if (!existing) {
    const error = new Error(`No existe estrategia ${id}.`);
    error.status = 404;
    throw error;
  }

  const strategy = {
    ...existing,
    ...normalizeStrategy({ ...existing, ...input }),
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };

  store.strategies[id] = strategy;
  await writeStore(store);
  return strategy;
}
