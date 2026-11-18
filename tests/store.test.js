"use strict";

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
