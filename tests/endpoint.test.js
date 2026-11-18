"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { config, RATE_LIMITS } = require("../lib/config");
const { defineEndpoint } = require("../lib/endpoint");
const { ApiError } = require("../lib/http");
const { StoreError } = require("../lib/store");

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
    },
    end(data) {
      this.payload = data ? JSON.parse(data) : null;
    }
  };
}

async function call(definition, method = "GET") {
  const res = mockResponse();
  await defineEndpoint({ methods: ["GET"], requireReady: false, ...definition })(
    { method, headers: {}, socket: { remoteAddress: `192.0.2.${Math.random()}` } },
    res
  );
  return res;
}

test.beforeEach((context) => {
  context.mock.method(console, "error", () => {});
});

test("a handler result becomes a JSON response", async () => {
  const res = await call({ handle: async () => ({ status: 201, body: { created: true } }) });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.payload, { created: true });
  assert.equal(res.headers["cache-control"], "no-store");
});

test("an unsupported method never reaches the handler", async () => {
  const res = await call({ handle: () => assert.fail("handler ran") }, "DELETE");
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET");
});

test("a disabled endpoint responds 404", async () => {
  const res = await call({ isEnabled: () => false, handle: () => assert.fail("handler ran") });
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.error, "NOT_FOUND");
});

test("an unready verifier responds 503", async () => {
  const original = config.ready;
  config.ready = false;
  try {
    const res = await call({ requireReady: true, handle: () => assert.fail("handler ran") });
    assert.equal(res.statusCode, 503);
    assert.equal(res.payload.error, "SERVER_NOT_CONFIGURED");
  } finally {
    config.ready = original;
  }
});

test("expected errors keep their status, code, and extra fields", async () => {
  const res = await call({
    errorFields: { verified: false },
    handle: async () => {
      throw new ApiError(409, "CHALLENGE_USED", "Already used.");
    }
  });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.payload, {
    verified: false,
    error: "CHALLENGE_USED",
    message: "Already used."
  });
});

test("store failures are reported without internal detail", async () => {
  const res = await call({
    handle: async () => {
      throw new StoreError("redis.internal refused the connection");
    }
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error, "STORE_UNAVAILABLE");
  assert.doesNotMatch(res.payload.message, /redis\.internal/);
});

test("unexpected failures are reported without internal detail", async () => {
  const res = await call({
    handle: async () => {
      throw new Error("secret stack detail");
    }
  });
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.error, "INTERNAL_ERROR");
  assert.doesNotMatch(res.payload.message, /secret/);
});

test("a rate-limited request stops before the handler", async () => {
  const definition = {
    rateLimit: { ...RATE_LIMITS.reset, scope: "endpoint-test", limit: 0 },
    handle: () => assert.fail("handler ran")
  };
  const res = await call(definition);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.error, "RATE_LIMITED");
});
