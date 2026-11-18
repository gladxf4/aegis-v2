"use strict";

if (process.stdout?.setMaxListeners) {
  process.stdout.setMaxListeners(50);
}
if (process.stderr?.setMaxListeners) {
  process.stderr.setMaxListeners(50);
}

const assert = require("node:assert/strict");
const test = require("node:test");
const { getStore, resetStoreForTests, StoreError } = require("../lib/store");

function clearRedisEnv() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

test("memory store consumes a challenge only once", async () => {
  clearRedisEnv();
  resetStoreForTests();
  const store = getStore();

  assert.equal(store.backend, "memory");
  assert.equal(await store.consumeProof("challenge-1", 60, "app", "a"), "accepted");
  assert.equal(await store.consumeProof("challenge-1", 60, "app", "b"), "challenge_used");
});

test("memory store rejects a duplicate nullifier within one application", async () => {
  clearRedisEnv();
  resetStoreForTests();
  const store = getStore();

  assert.equal(await store.consumeProof("c1", 60, "app", "n"), "accepted");
  assert.equal(await store.consumeProof("c2", 60, "app", "n"), "duplicate_nullifier");
  assert.equal(await store.consumeProof("c3", 60, "other-app", "n"), "accepted");
});

test("memory store resets one application at a time", async () => {
  clearRedisEnv();
  resetStoreForTests();
  const store = getStore();

  await store.consumeProof("c1", 60, "app", "a");
  await store.consumeProof("c2", 60, "app", "b");
  await store.consumeProof("c3", 60, "other-app", "c");

  assert.equal(await store.reset("app"), 2);
  assert.equal(await store.consumeProof("c4", 60, "app", "a"), "accepted");
  assert.equal(await store.consumeProof("c5", 60, "other-app", "c"), "duplicate_nullifier");
});

test("memory store opens a new rate-limit window after expiry", async () => {
  clearRedisEnv();
  resetStoreForTests();
  const store = getStore();
  const realNow = Date.now;
  try {
    assert.equal((await store.consumeRateLimit("key", 1, 60)).allowed, true);
    assert.equal((await store.consumeRateLimit("key", 1, 60)).allowed, false);
    Date.now = () => realNow() + 61_000;
    assert.equal((await store.consumeRateLimit("key", 1, 60)).allowed, true);
  } finally {
    Date.now = realNow;
  }
});

test("an incomplete Redis configuration fails closed", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://example.invalid";
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetStoreForTests();

  const store = getStore();
  assert.equal(store.backend, "misconfigured");
  assert.equal(await store.ping(), false);
  await assert.rejects(() => store.consumeProof("c", 60, "app", "n"), StoreError);
  await assert.rejects(() => store.consumeRateLimit("key", 1, 60), StoreError);

  clearRedisEnv();
  resetStoreForTests();
});

test("redis store executes commands and maps outcomes correctly", async () => {
  const originalFetch = global.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://example-redis.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "example-token";
  resetStoreForTests();

  let mockResponse = { result: "OK" };
  global.fetch = async (url, options) => {
    return {
      ok: true,
      json: async () => mockResponse
    };
  };

  const store = getStore();
  assert.equal(store.backend, "redis");

  // test consumeProof
  mockResponse = { result: 1 };
  assert.equal(await store.consumeProof("c", 60, "app", "n"), "accepted");
  mockResponse = { result: -1 };
  assert.equal(await store.consumeProof("c", 60, "app", "n"), "challenge_used");
  mockResponse = { result: 0 };
  assert.equal(await store.consumeProof("c", 60, "app", "n"), "duplicate_nullifier");
  mockResponse = { result: 7 };
  await assert.rejects(() => store.consumeProof("c", 60, "app", "n"), StoreError);

  // test consumeRateLimit
  mockResponse = { result: [2, 45] };
  const rate = await store.consumeRateLimit("key", 5, 60);
  assert.equal(rate.allowed, true);
  assert.equal(rate.remaining, 3);
  assert.equal(rate.resetInSeconds, 45);
  mockResponse = { result: "unexpected" };
  await assert.rejects(() => store.consumeRateLimit("key", 5, 60), StoreError);
  mockResponse = { error: "ERR script failed" };
  await assert.rejects(() => store.consumeRateLimit("key", 5, 60), StoreError);

  // test reset
  mockResponse = { result: 3 };
  assert.equal(await store.reset("app"), 3);

  // test ping
  mockResponse = { result: "PONG" };
  assert.equal(await store.ping(), true);

  // test HTTP error and store failure
  global.fetch = async () => ({ ok: false, status: 500 });
  assert.equal(await store.ping(), false);
  await assert.rejects(() => store.consumeProof("c", 60, "app", "n"), StoreError);

  global.fetch = originalFetch;
  clearRedisEnv();
  resetStoreForTests();
});
