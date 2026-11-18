"use strict";

if (process.stdout?.setMaxListeners) {
  process.stdout.setMaxListeners(50);
}
if (process.stderr?.setMaxListeners) {
  process.stderr.setMaxListeners(50);
}

const assert = require("node:assert/strict");
const test = require("node:test");
const { sendJson, methodNotAllowed, getBody, queryValue } = require("../lib/http");

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body = "";
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    end(data) {
      body = data;
    },
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = code;
    },
    get body() {
      return body ? JSON.parse(body) : null;
    }
  };
}

test("sendJson sets correct headers and status", () => {
  const res = mockRes();
  sendJson(res, 201, { success: true });
  assert.equal(res.statusCode, 201);
  assert.equal(res.getHeader("content-type"), "application/json; charset=utf-8");
  assert.equal(res.getHeader("cache-control"), "no-store");
  assert.deepEqual(res.body, { success: true });
});

test("methodNotAllowed sets Allow header and returns 405 error", () => {
  const res = mockRes();
  methodNotAllowed(res, ["GET", "POST"]);
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader("allow"), "GET, POST");
  assert.equal(res.body.error, "METHOD_NOT_ALLOWED");
});

test("getBody handles object, string, and null bodies", () => {
  assert.deepEqual(getBody({ body: { a: 1 } }), { a: 1 });
  assert.deepEqual(getBody({ body: '{"b":2}' }), { b: 2 });
  assert.equal(getBody({ body: "" }), null);
  assert.equal(getBody({ body: null }), null);
  assert.equal(getBody({}), null);
});

test("queryValue extracts values from req.query and req.url searchParams", () => {
  assert.equal(queryValue({ query: { test: "val" } }, "test"), "val");
  assert.equal(queryValue({ query: { test: ["first", "second"] } }, "test"), "first");
  assert.equal(queryValue({ url: "/api?foo=bar" }, "foo"), "bar");
  assert.equal(queryValue({ url: "/api" }, "missing"), null);
});
