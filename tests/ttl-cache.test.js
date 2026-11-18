"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createTtlCache } = require("../lib/ttl-cache");

test("values are reused until they expire", async (context) => {
  context.mock.timers.enable({ apis: ["Date"] });
  let loads = 0;
  const cache = createTtlCache(async () => ++loads, 1000);

  assert.equal(await cache.get(), 1);
  assert.equal(await cache.get(), 1);
  context.mock.timers.tick(1001);
  assert.equal(await cache.get(), 2);
});

test("concurrent callers share one load", async () => {
  let loads = 0;
  const cache = createTtlCache(async () => ++loads, 1000);
  assert.deepEqual(await Promise.all([cache.get(), cache.get()]), [1, 1]);
});

test("failures are not cached", async () => {
  let attempts = 0;
  const cache = createTtlCache(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("temporary");
    }
    return "recovered";
  }, 1000);

  await assert.rejects(() => cache.get(), /temporary/);
  assert.equal(await cache.get(), "recovered");
});

test("clear forces a new load", async () => {
  let loads = 0;
  const cache = createTtlCache(async () => ++loads, 1000);
  await cache.get();
  cache.clear();
  assert.equal(await cache.get(), 2);
});
