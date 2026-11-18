"use strict";

process.env.CHALLENGE_SECRET = "challenge-test-secret";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createChallenge, verifyChallenge, utcDate } = require("../lib/challenge");

const secret = "challenge-test-secret";
const now = Date.UTC(2026, 10, 18, 9, 30, 0);

test("a challenge token round-trips", () => {
  const { token, payload } = createChallenge({
    secret,
    appId: "42",
    ttlSeconds: 120,
    now
  });

  assert.equal(payload.app_id, "42");
  assert.equal(payload.ref_date, "20261118");
  assert.equal(payload.exp - payload.iat, 120);

  const result = verifyChallenge(token, { secret, appId: "42", now: now + 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.payload.cid, payload.cid);
  assert.equal(result.payload.nonce, payload.nonce);
});

test("a missing secret is rejected at creation", () => {
  assert.throws(() => createChallenge({ secret: "", appId: "42", now }), /CHALLENGE_SECRET/);
});

test("a modified token fails the signature check", () => {
  const { token } = createChallenge({ secret, appId: "42", now });
  const [body, signature] = token.split(".");
  const tampered = `${body}.${signature.slice(0, -2)}aa`;

  const result = verifyChallenge(tampered, { secret, appId: "42", now });
  assert.equal(result.ok, false);
  assert.equal(result.code, "CHALLENGE_INVALID");
});

test("an expired challenge is rejected", () => {
  const { token } = createChallenge({ secret, appId: "42", ttlSeconds: 60, now });
  const result = verifyChallenge(token, { secret, appId: "42", now: now + 61_000 });

  assert.equal(result.ok, false);
  assert.equal(result.code, "CHALLENGE_EXPIRED");
});

test("a challenge for another application is rejected", () => {
  const { token } = createChallenge({ secret, appId: "42", now });
  const result = verifyChallenge(token, { secret, appId: "43", now });

  assert.equal(result.ok, false);
  assert.equal(result.code, "APP_MISMATCH");
});

test("a malformed token is rejected", () => {
  for (const token of ["", "not-a-token", "a.b.c", "x".repeat(3000)]) {
    const result = verifyChallenge(token, { secret, appId: "42", now });
    assert.equal(result.ok, false);
    assert.equal(result.code, "CHALLENGE_INVALID");
  }
});

test("utcDate formats a timestamp as YYYYMMDD", () => {
  assert.equal(utcDate(Date.UTC(2026, 0, 2, 23, 59, 59)), "20260102");
});
