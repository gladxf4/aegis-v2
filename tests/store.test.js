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
  assert.equal(await store.consumeChallenge("challenge-1", 60), true);
  assert.equal(await store.consumeChallenge("challenge-1", 60), false);
  assert.equal(await store.consumeChallenge("challenge-2", 60), true);
});

test("memory store rejects a duplicate nullifier", async () => {
  clearRedisEnv();
  resetStoreForTests();
  const store = getStore();

  assert.equal(await store.addNullifier("app", "nullifier-1"), true);
  assert.equal(await store.addNullifier("app", "nullifier-1"), false);
  assert.equal(await store.addNullifier("app", "nullifier-2"), true);
  assert.equal(await store.addNullifier("other-app", "nullifier-1"), true);
});

test("memory store resets one application at a time", async () => {
  clearRedisEnv();
  resetStoreForTests();
  const store = getStore();

  await store.addNullifier("app", "a");
  await store.addNullifier("app", "b");
  await store.addNullifier("other-app", "c");

  assert.equal(await store.reset("app"), 2);
  assert.equal(await store.addNullifier("app", "a"), true);
  assert.equal(await store.addNullifier("other-app", "c"), false);
});

test("an incomplete Redis configuration fails closed", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://example.invalid";
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetStoreForTests();

  const store = getStore();
  assert.equal(store.backend, "misconfigured");
  assert.equal(await store.ping(), false);
  await assert.rejects(() => store.consumeChallenge("c", 60), StoreError);

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

  // test consumeChallenge
  mockResponse = { result: "OK" };
  assert.equal(await store.consumeChallenge("cid-1", 60), true);
  mockResponse = { result: null };
  assert.equal(await store.consumeChallenge("cid-1", 60), false);

  // test addNullifier
  mockResponse = { result: 1 };
  assert.equal(await store.addNullifier("app", "null-1"), true);
  mockResponse = { result: 0 };
  assert.equal(await store.addNullifier("app", "null-1"), false);

  // test consumeProof
  mockResponse = { result: 1 };
  assert.equal(await store.consumeProof("c", 60, "app", "n"), "accepted");
  mockResponse = { result: -1 };
  assert.equal(await store.consumeProof("c", 60, "app", "n"), "challenge_used");
  mockResponse = { result: 0 };
  assert.equal(await store.consumeProof("c", 60, "app", "n"), "duplicate_nullifier");

  // test consumeRateLimit
  mockResponse = { result: [2, 45] };
  const rate = await store.consumeRateLimit("key", 5, 60);
  assert.equal(rate.allowed, true);
  assert.equal(rate.remaining, 3);
  assert.equal(rate.resetInSeconds, 45);

  // test reset
  mockResponse = { result: 3 };
  assert.equal(await store.reset("app"), 3);

  // test ping
  mockResponse = { result: "PONG" };
  assert.equal(await store.ping(), true);

  // test HTTP error and store failure
  global.fetch = async () => ({ ok: false, status: 500 });
  assert.equal(await store.ping(), false);
  await assert.rejects(() => store.consumeChallenge("c", 60), StoreError);

  global.fetch = originalFetch;
  clearRedisEnv();
  resetStoreForTests();
});
