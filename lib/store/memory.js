"use strict";

function deleteExpired(entries, now, expiryOf) {
  for (const [key, value] of entries) {
    if (expiryOf(value) <= now) {
      entries.delete(key);
    }
  }
}

/**
 * Process-local state for development and tests. It is lost on restart and is not
 * shared between instances, so production configuration rejects it.
 *
 * @returns {object} Store interface
 */
function createMemoryStore() {
  const challenges = new Map();
  const nullifiersByApp = new Map();
  const rateWindows = new Map();

  return {
    backend: "memory",

    async consumeProof(challengeId, ttlSeconds, appId, nullifier) {
      const now = Date.now();
      deleteExpired(challenges, now, (expiresAt) => expiresAt);
      if (challenges.has(challengeId)) {
        return "challenge_used";
      }
      challenges.set(challengeId, now + ttlSeconds * 1000);

      const nullifiers = nullifiersByApp.get(appId) ?? new Set();
      nullifiersByApp.set(appId, nullifiers);
      if (nullifiers.has(nullifier)) {
        return "duplicate_nullifier";
      }
      nullifiers.add(nullifier);
      return "accepted";
    },

    async consumeRateLimit(key, limit, windowSeconds) {
      const now = Date.now();
      deleteExpired(rateWindows, now, (window) => window.resetAt);
      const window = rateWindows.get(key) ?? { count: 0, resetAt: now + windowSeconds * 1000 };
      window.count += 1;
      rateWindows.set(key, window);
      return {
        allowed: window.count <= limit,
        remaining: Math.max(0, limit - window.count),
        resetInSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000))
      };
    },

    async reset(appId) {
      const cleared = nullifiersByApp.get(appId)?.size ?? 0;
      nullifiersByApp.delete(appId);
      return cleared;
    },

    async ping() {
      return true;
    }
  };
}

module.exports = { createMemoryStore };
