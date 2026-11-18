"use strict";

const { StoreError } = require("./errors");

const REQUEST_TIMEOUT_MS = 5000;

// Both scripts run atomically, so concurrent instances cannot pass the same
// challenge or nullifier between a check and its write.
const CONSUME_PROOF_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then
  return -1
end
redis.call("SET", KEYS[1], "1", "EX", ARGV[1])
if redis.call("SISMEMBER", KEYS[2], ARGV[2]) == 1 then
  return 0
end
redis.call("SADD", KEYS[2], ARGV[2])
return 1
`;

const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return { count, redis.call("TTL", KEYS[1]) }
`;

const PROOF_OUTCOMES = new Map([
  [-1, "challenge_used"],
  [0, "duplicate_nullifier"],
  [1, "accepted"]
]);

const nullifierKey = (appId) => `aegis:nullifiers:${appId}`;
const wholeSeconds = (seconds) => String(Math.max(1, Math.floor(seconds)));

/**
 * Shared state backed by the Upstash Redis REST API.
 *
 * @param {string} url
 * @param {string} token
 * @returns {object} Store interface
 */
function createRedisStore(url, token) {
  async function command(args) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) {
        throw new Error(`Redis HTTP ${response.status}`);
      }
      const body = await response.json();
      if (body?.error) {
        throw new Error(body.error);
      }
      return body?.result ?? null;
    } catch (error) {
      throw new StoreError("The state store request failed.", error);
    }
  }

  return {
    backend: "redis",

    async consumeProof(challengeId, ttlSeconds, appId, nullifier) {
      const result = await command([
        "EVAL",
        CONSUME_PROOF_SCRIPT,
        "2",
        `aegis:challenge:${challengeId}`,
        nullifierKey(appId),
        wholeSeconds(ttlSeconds),
        nullifier
      ]);
      const outcome = PROOF_OUTCOMES.get(Number(result));
      if (!outcome) {
        throw new StoreError("The state store returned an unexpected proof outcome.");
      }
      return outcome;
    },

    async consumeRateLimit(key, limit, windowSeconds) {
      const result = await command([
        "EVAL",
        RATE_LIMIT_SCRIPT,
        "1",
        `aegis:rate:${key}`,
        wholeSeconds(windowSeconds)
      ]);
      const [count, ttl] = Array.isArray(result) ? result.map(Number) : [];
      if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
        throw new StoreError("The state store returned an invalid rate-limit result.");
      }
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetInSeconds: Math.max(1, ttl)
      };
    },

    async reset(appId) {
      return Number(await command(["DEL", nullifierKey(appId)])) || 0;
    },

    async ping() {
      try {
        return (await command(["PING"])) === "PONG";
      } catch (error) {
        return false;
      }
    }
  };
}

module.exports = { createRedisStore };
