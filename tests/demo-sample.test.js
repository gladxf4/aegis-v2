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
const handler = require("../api/demo-sample");

config.trustProxyHeaders = true;

function mockReq(method = "GET", query = {}) {
  const url = new URL("http://localhost/api/demo-sample");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return {
    method,
    url: url.pathname + url.search,
    query,
    headers: { "x-real-ip": `198.51.100.${Math.floor(Math.random() * 200) + 1}` }
  };
}

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

test("demo-sample handler returns 200 and a valid sample credential", async () => {
  const req = mockReq("GET");
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.credential.kind, "sample");
  assert.equal(typeof res.body.credential.uid, "string");
  assert.equal(typeof res.body.pool_size, "number");
  assert.ok(res.body.pool_size > 0);
});

test("demo-sample honors exclude query parameter", async () => {
  const firstReq = mockReq("GET");
  const firstRes = mockRes();
  await handler(firstReq, firstRes);
  const firstUid = firstRes.body.credential.uid;

  const secondReq = mockReq("GET", { exclude: firstUid });
  const secondRes = mockRes();
  await handler(secondReq, secondRes);

  if (secondRes.body.pool_size > 1) {
    assert.notEqual(secondRes.body.credential.uid, firstUid);
  }
});

test("demo-sample rejects non-GET methods with 405", async () => {
  const req = mockReq("POST");
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error, "METHOD_NOT_ALLOWED");
});
