"use strict";

const { readRedisSettings } = require("../config");
const { StoreError } = require("./errors");
const { createMemoryStore } = require("./memory");
const { createRedisStore } = require("./redis");

function createMisconfiguredStore(message) {
  const fail = async () => {
    throw new StoreError(message);
  };
  return {
    backend: "misconfigured",
    consumeProof: fail,
    consumeRateLimit: fail,
    reset: fail,
    ping: async () => false
  };
}

function createStore() {
  const { url, token } = readRedisSettings();
  if (url && token) {
    return createRedisStore(url, token);
  }
  if (url || token) {
    return createMisconfiguredStore("Redis URL and token must both be set.");
  }
  return createMemoryStore();
}

let activeStore = null;

/**
 * @returns {object} The process-wide state store
 */
function getStore() {
  activeStore ??= createStore();
  return activeStore;
}

/**
 * Forces the next getStore call to read the environment again.
 */
function resetStoreForTests() {
  activeStore = null;
}

module.exports = { getStore, resetStoreForTests, StoreError };
