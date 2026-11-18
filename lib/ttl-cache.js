"use strict";

/**
 * Memoizes an async loader for a short period. Concurrent callers share one
 * in-flight request, and failures are never cached.
 *
 * @template T
 * @param {() => Promise<T>} load
 * @param {number} ttlMs
 * @returns {{ get: () => Promise<T>, clear: () => void }}
 */
function createTtlCache(load, ttlMs) {
  let entry = null;

  return {
    get() {
      if (entry && entry.expiresAt > Date.now()) {
        return entry.value;
      }
      const current = {
        expiresAt: Date.now() + ttlMs,
        value: Promise.resolve().then(load)
      };
      entry = current;
      current.value.catch(() => {
        if (entry === current) {
          entry = null;
        }
      });
      return current.value;
    },
    clear() {
      entry = null;
    }
  };
}

module.exports = { createTtlCache };
