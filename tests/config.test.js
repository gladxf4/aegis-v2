"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FIELD_MODULUS,
  isChallengeSecretValid,
  isValidIssuerKeyHash,
  normalizeChallengeTtl
} = require("../lib/config");

test("production challenge secret must contain at least 32 bytes", () => {
  assert.equal(isChallengeSecretValid("short secret", "production"), false);
  assert.equal(isChallengeSecretValid("r".repeat(32), "production"), true);
  assert.equal(isChallengeSecretValid("short secret", "development"), true);
  assert.equal(isChallengeSecretValid("", "development"), false);
});

test("a 31-byte production secret is rejected", () => {
  assert.equal(isChallengeSecretValid("r".repeat(31), "production"), false);
});

test("challenge lifetime defaults safely and is capped at one hour", () => {
  assert.equal(normalizeChallengeTtl("invalid"), 300);
  assert.equal(normalizeChallengeTtl("0"), 300);
  assert.equal(normalizeChallengeTtl("300"), 300);
  assert.equal(normalizeChallengeTtl("86400"), 3600);
});

test("issuer key hash must be a non-zero field element", () => {
  assert.equal(isValidIssuerKeyHash("1"), true);
  assert.equal(isValidIssuerKeyHash("0"), false);
  assert.equal(isValidIssuerKeyHash(FIELD_MODULUS.toString()), false);
  assert.equal(isValidIssuerKeyHash("not-a-number"), false);
});
