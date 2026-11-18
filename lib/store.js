"use strict";

const { config } = require("./config");

const REDIS_CONSUME_PROOF = `
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

class StoreError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "StoreError";
    this.code = "STORE_UNAVAILABLE";
    this.cause = cause;
  }
}

function memoryStore() {
  const challenges = new Map();
  const nullifiers = new Map();

  const prune = () => {
    const now = Date.now();
    for (const [cid, expiresAt] of challenges) {
      if (expiresAt <= now) {
        challenges.delete(cid);
      }
    }
  };

  return {
    backend: "memory",
    async consumeChallenge(cid, ttlSeconds) {
      prune();
      if (challenges.has(cid)) {
        return false;
      }
      challenges.set(cid, Date.now() + ttlSeconds * 1000);
      return true;
    },
    async addNullifier(appId, nullifier) {
      let set = nullifiers.get(appId);
      if (!set) {
        set = new Set();
        nullifiers.set(appId, set);
      }
      if (set.has(nullifier)) {
        return false;
      }
      set.add(nullifier);
      return true;
    },
    async consumeProof(cid, ttlSeconds, appId, nullifier) {
      prune();
      if (challenges.has(cid)) {
        return "challenge_used";
      }
      challenges.set(cid, Date.now() + ttlSeconds * 1000);
      let set = nullifiers.get(appId);
      if (!set) {
        set = new Set();
        nullifiers.set(appId, set);
      }
      if (set.has(nullifier)) {
        return "duplicate_nullifier";
      }
      set.add(nullifier);
      return "accepted";
    },
    async reset(appId) {
      const set = nullifiers.get(appId);
      const count = set ? set.size : 0;
      nullifiers.delete(appId);
      return count;
    },
    async ping() {
      return true;
    }
  };
}

function redisStore(url, token) {
  async function command(args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(args),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Redis HTTP ${response.status}`);
      }
      const body = await response.json();
      if (body && body.error) {
        throw new Error(body.error);
      }
      return body ? body.result : null;
    } catch (error) {
      throw new StoreError("Nullifier store is unavailable.", error);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    backend: "redis",
    async consumeChallenge(cid, ttlSeconds) {
      const result = await command([
        "SET",
        `aegis:challenge:${cid}`,
        "1",
        "NX",
        "EX",
        String(Math.max(1, Math.floor(ttlSeconds)))
      ]);
      return result === "OK";
    },
    async addNullifier(appId, nullifier) {
      const result = await command(["SADD", `aegis:nullifiers:${appId}`, nullifier]);
      return Number(result) === 1;
    },
    async consumeProof(cid, ttlSeconds, appId, nullifier) {
      const result = await command([
        "EVAL",
        REDIS_CONSUME_PROOF,
        "2",
        `aegis:challenge:${cid}`,
        `aegis:nullifiers:${appId}`,
        String(Math.max(1, Math.floor(ttlSeconds))),
        nullifier
      ]);
      if (Number(result) === -1) {
        return "challenge_used";
      }
      if (Number(result) === 0) {
        return "duplicate_nullifier";
      }
      if (Number(result) === 1) {
        return "accepted";
      }
      throw new StoreError("Nullifier store returned an unexpected result.");
    },
    async reset(appId) {
      const result = await command(["DEL", `aegis:nullifiers:${appId}`]);
      return Number(result) || 0;
    },
    async ping() {
      try {
        const result = await command(["PING"]);
        return result === "PONG";
      } catch (error) {
        return false;
      }
    }
  };
}

function brokenStore(message) {
  const fail = async () => {
    throw new StoreError(message);
  };
  return {
    backend: "misconfigured",
    consumeChallenge: fail,
    addNullifier: fail,
    consumeProof: fail,
    reset: fail,
    ping: async () => false
  };
}

function buildStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    return redisStore(url, token);
  }
  if (url || token) {
    return brokenStore("Redis URL and token must both be set.");
  }
  return memoryStore();
}

let currentStore = null;

function getStore() {
  if (!currentStore) {
    currentStore = buildStore();
  }
  return currentStore;
}

function resetStoreForTests() {
  currentStore = null;
}

module.exports = { getStore, resetStoreForTests, StoreError, config };
