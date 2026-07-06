import { MongoClient } from 'mongodb';

const DEFAULT_DB_NAME = 'iol_market_data_lab';
const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_MARKET_START_HOUR = 10;
const DEFAULT_MARKET_END_HOUR = 18;
const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const memoryCache = new Map();
const pendingLoads = new Map();

let mongoClient = null;
let mongoDb = null;
let mongoReady = false;
let mongoWarningShown = false;

function cacheConfig() {
  const ttlMinutes = Number(process.env.MARKET_CACHE_INTERVAL_MINUTES || DEFAULT_TTL_MINUTES);
  return {
    ttlMs: Math.max(1, ttlMinutes) * 60_000,
    timeZone: process.env.MARKET_CACHE_TIME_ZONE || DEFAULT_TIME_ZONE,
    startHour: Number(process.env.MARKET_CACHE_START_HOUR || DEFAULT_MARKET_START_HOUR),
    endHour: Number(process.env.MARKET_CACHE_END_HOUR || DEFAULT_MARKET_END_HOUR),
    dbName: process.env.MONGO_DB || process.env.MONGODB_DB || DEFAULT_DB_NAME,
    mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || ''
  };
}

function marketClock(now = new Date()) {
  const { timeZone, startHour, endHour } = cacheConfig();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const weekday = parts.weekday;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const weekdayOpen = !['Sat', 'Sun'].includes(weekday);
  const minutes = hour * 60 + minute;
  const openMinutes = startHour * 60;
  const closeMinutes = endHour * 60;

  return {
    isOpen: weekdayOpen && minutes >= openMinutes && minutes <= closeMinutes,
    weekday,
    hour,
    minute,
    startHour,
    endHour,
    timeZone
  };
}

async function db() {
  const { mongoUri, dbName } = cacheConfig();
  if (!mongoUri) return null;
  if (mongoReady && mongoDb) return mongoDb;

  try {
    mongoClient = mongoClient || new MongoClient(mongoUri);
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
    await mongoDb.collection('market_data_cache').createIndex({ key: 1 }, { unique: true });
    await mongoDb.collection('market_data_cache').createIndex({ kind: 1, fetchedAt: -1 });
    mongoReady = true;
    return mongoDb;
  } catch (error) {
    if (!mongoWarningShown) {
      console.warn(`Mongo cache deshabilitado: ${error.message}`);
      mongoWarningShown = true;
    }
    mongoReady = false;
    return null;
  }
}

async function readCache(key) {
  const database = await db();
  if (database) {
    const doc = await database.collection('market_data_cache').findOne({ key });
    if (doc) return doc;
  }
  return memoryCache.get(key) || null;
}

async function writeCache({ key, kind, data }) {
  const now = new Date();
  const doc = {
    key,
    kind,
    data,
    fetchedAt: now,
    updatedAt: now
  };
  memoryCache.set(key, doc);

  const database = await db();
  if (!database) return doc;
  await database.collection('market_data_cache').updateOne(
    { key },
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  return doc;
}

function ageMs(doc, now = Date.now()) {
  if (!doc?.fetchedAt) return Infinity;
  return now - new Date(doc.fetchedAt).getTime();
}

export function isMarketOpen(now = new Date()) {
  return marketClock(now).isOpen;
}

export async function getCachedMarketData({ key, kind, loader, force = false, allowStaleOutsideMarket = true }) {
  const { ttlMs } = cacheConfig();
  const clock = marketClock();
  const cached = await readCache(key);
  const stale = !cached || ageMs(cached) > ttlMs;

  if (!clock.isOpen && allowStaleOutsideMarket) {
    if (cached) {
      return {
        data: cached.data,
        cache: {
          hit: true,
          stale,
          source: 'cache-outside-market',
          fetchedAt: cached.fetchedAt,
          marketOpen: false,
          key
        }
      };
    }
    const error = new Error(`No hay datos cacheados para ${key} y el mercado esta cerrado.`);
    error.status = 503;
    throw error;
  }

  const canRefresh = force || clock.isOpen || !cached || !allowStaleOutsideMarket;

  if (cached && !force && (!stale || !canRefresh)) {
    return {
      data: cached.data,
      cache: {
        hit: true,
        stale,
        source: 'cache',
        fetchedAt: cached.fetchedAt,
        marketOpen: clock.isOpen,
        key
      }
    };
  }

  if (pendingLoads.has(key)) return pendingLoads.get(key);

  const pending = (async () => {
    try {
      const data = await loader();
      const saved = await writeCache({ key, kind, data });
      return {
        data,
        cache: {
          hit: false,
          stale: false,
          source: 'iol',
          fetchedAt: saved.fetchedAt,
          marketOpen: clock.isOpen,
          key
        }
      };
    } catch (error) {
      if (cached) {
        console.warn(`Uso cache stale para ${key}: ${error.message}`);
        return {
          data: cached.data,
          cache: {
            hit: true,
            stale: true,
            source: 'cache-stale',
            fetchedAt: cached.fetchedAt,
            marketOpen: clock.isOpen,
            key,
            error: error.message
          }
        };
      }
      throw error;
    } finally {
      pendingLoads.delete(key);
    }
  })();

  pendingLoads.set(key, pending);
  return pending;
}

export function marketCacheStatus() {
  const { ttlMs, mongoUri, dbName } = cacheConfig();
  return {
    mongoEnabled: Boolean(mongoUri),
    mongoReady,
    dbName,
    ttlMinutes: ttlMs / 60_000,
    clock: marketClock()
  };
}
