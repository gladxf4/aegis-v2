"use strict";

if (process.stdout?.setMaxListeners) {
  process.stdout.setMaxListeners(50);
}
if (process.stderr?.setMaxListeners) {
  process.stderr.setMaxListeners(50);
}

const assert = require("node:assert/strict");
const test = require("node:test");
const { config } = require("../lib/config");
const { clientAddress, enforceRateLimit } = require("../lib/rate-limit");

config.trustProxyHeaders = true;

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    end(data) {
      body = data ? JSON.parse(data) : null;
    },
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = code;
    },
    get body() {
      return body;
    }
  };
}

test("clientAddress prioritizes x-real-ip over x-forwarded-for", () => {
  const req = {
    headers: {
      "x-real-ip": "203.0.113.195",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1"
    }
  };
  assert.equal(clientAddress(req), "203.0.113.195");
});

test("clientAddress uses x-vercel-forwarded-for when x-real-ip is absent", () => {
  const req = {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.50",
      "x-forwarded-for": "198.51.100.1"
    }
  };
  assert.equal(clientAddress(req), "203.0.113.50");
});

test("clientAddress falls back to x-forwarded-for and trims", () => {
  const req = {
    headers: {
      "x-forwarded-for": "198.51.100.42, 10.0.0.1"
    }
  };
  assert.equal(clientAddress(req), "198.51.100.42");
});

test("clientAddress falls back to socket remote address", () => {
  const req = {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  };
  assert.equal(clientAddress(req), "127.0.0.1");
});

test("clientAddress returns unknown when no address is present", () => {
  assert.equal(clientAddress({}), "unknown");
});

test("enforceRateLimit permits requests up to limit and blocks after", async () => {
  const ip = "192.0.2.100";
  const req = { headers: { "x-real-ip": ip } };
  const scope = "unit-test-scope";
  const limit = 3;
  const windowSeconds = 60;

  for (let i = 1; i <= limit; i += 1) {
    const res = mockRes();
    const allowed = await enforceRateLimit(req, res, { scope, limit, windowSeconds });
    assert.equal(allowed, true);
    assert.equal(res.getHeader("ratelimit-limit"), String(limit));
    assert.equal(res.getHeader("ratelimit-remaining"), String(limit - i));
  }

  // Next request exceeds limit
  const blockedRes = mockRes();
  const allowed = await enforceRateLimit(req, blockedRes, { scope, limit, windowSeconds });
  assert.equal(allowed, false);
  assert.equal(blockedRes.statusCode, 429);
  assert.equal(blockedRes.getHeader("retry-after"), "60");
  assert.equal(blockedRes.body.error, "RATE_LIMITED");
});

test("clientAddress ignores forwarding headers without a trusted proxy", () => {
  config.trustProxyHeaders = false;
  try {
    const address = clientAddress({
      headers: { "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.10" },
      socket: { remoteAddress: "192.0.2.1" }
    });
    assert.equal(address, "192.0.2.1");
  } finally {
    config.trustProxyHeaders = true;
  }
});
