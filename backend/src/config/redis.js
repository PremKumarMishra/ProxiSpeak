import Redis from 'ioredis';

let redisClient = null;
let isConnected = false;
let hasLoggedNotice = false;

const redisConfig = process.env.REDIS_URL
  ? process.env.REDIS_URL
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 5) {
          // Back off to every 30 seconds after initial failed attempts
          return 30000;
        }
        return Math.min(times * 1000, 5000);
      },
    };

try {
  redisClient = new Redis(redisConfig, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 5) {
        return 30000;
      }
      return Math.min(times * 1000, 5000);
    },
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connection established with Redis server.');
  });

  redisClient.on('ready', () => {
    isConnected = true;
    hasLoggedNotice = false;
    console.log('[Redis] Redis ready for caching and pub/sub operations.');
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    if (!hasLoggedNotice) {
      console.warn(`[Redis] Notice: Redis service not connected (${err.message}). In-memory fallbacks active.`);
      hasLoggedNotice = true;
    }
  });

  redisClient.on('close', () => {
    isConnected = false;
  });

  redisClient.on('reconnecting', () => {
    // Reconnecting silently
  });
} catch (err) {
  console.warn('[Redis] Failed to initialize Redis client:', err.message);
  redisClient = null;
}

/**
 * Connect to Redis gracefully without throwing unhandled exceptions.
 */
export const connectRedis = async () => {
  if (!redisClient) return null;
  try {
    await redisClient.connect();
    isConnected = true;
    return redisClient;
  } catch (err) {
    isConnected = false;
    // Log notice once; do NOT throw or exit process
    if (!hasLoggedNotice) {
      console.warn(`[Redis] Notice: Could not connect to Redis at startup (${err.message}). Continuing with in-memory storage.`);
      hasLoggedNotice = true;
    }
    return null;
  }
};

/**
 * Returns true if Redis is ready to accept commands.
 */
export const isRedisConnected = () => {
  return isConnected && redisClient && redisClient.status === 'ready';
};

/**
 * Returns the active Redis client.
 */
export const getRedisClient = () => {
  return redisClient;
};

export { redisClient };
export default redisClient;
