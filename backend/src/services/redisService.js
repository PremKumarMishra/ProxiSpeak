import { redisClient, isRedisConnected } from '../config/redis.js';

/**
 * Safe Get from Redis cache.
 * Returns null if key does not exist or Redis is disconnected.
 */
export const cacheGet = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    const val = await redisClient.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  } catch (err) {
    return null;
  }
};

/**
 * Safe Set in Redis cache with optional TTL in seconds.
 */
export const cacheSet = async (key, value, ttlSeconds = null) => {
  if (!isRedisConnected()) return false;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && Number(ttlSeconds) > 0) {
      await redisClient.set(key, serialized, 'EX', Number(ttlSeconds));
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Safe Delete from Redis cache.
 */
export const cacheDel = async (key) => {
  if (!isRedisConnected()) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Safe Hash Set.
 */
export const cacheHSet = async (key, field, value) => {
  if (!isRedisConnected()) return false;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await redisClient.hset(key, field, serialized);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Safe Hash Get.
 */
export const cacheHGet = async (key, field) => {
  if (!isRedisConnected()) return null;
  try {
    const val = await redisClient.hget(key, field);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  } catch (err) {
    return null;
  }
};

/**
 * Safe Hash Get All.
 */
export const cacheHGetAll = async (key) => {
  if (!isRedisConnected()) return {};
  try {
    const raw = await redisClient.hgetall(key);
    if (!raw) return {};
    const parsed = {};
    for (const [k, v] of Object.entries(raw)) {
      try {
        parsed[k] = JSON.parse(v);
      } catch {
        parsed[k] = v;
      }
    }
    return parsed;
  } catch (err) {
    return {};
  }
};

/**
 * Safe Hash Delete.
 */
export const cacheHDel = async (key, field) => {
  if (!isRedisConnected()) return false;
  try {
    await redisClient.hdel(key, field);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Room State Helper: Save active user in room hash.
 */
export const setRoomUserState = async (orgId, socketId, userData) => {
  if (!orgId || !socketId || !userData) return;
  await cacheHSet(`office:room:${orgId}`, socketId, userData);
};

/**
 * Room State Helper: Get all active users in a room.
 */
export const getRoomUserState = async (orgId) => {
  if (!orgId) return {};
  return await cacheHGetAll(`office:room:${orgId}`);
};

/**
 * Room State Helper: Remove user from room hash.
 */
export const removeRoomUserState = async (orgId, socketId) => {
  if (!orgId || !socketId) return;
  await cacheHDel(`office:room:${orgId}`, socketId);
};

/**
 * Room State Helper: Clear entire room hash.
 */
export const clearRoomState = async (orgId) => {
  if (!orgId) return;
  await cacheDel(`office:room:${orgId}`);
};
