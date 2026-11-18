"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FIELD_MODULUS,
  isChallengeSecretValid,
  isValidIssuerKeyHash,
  loadConfig,
  normalizeChallengeTtl
} = require("../lib/config");

const issuer = { keyHash: "42" };
const productionEnv = {
  NODE_ENV: "production",
  CHALLENGE_SECRET: "s".repeat(32),
  UPSTASH_REDIS_REST_URL: "https://redis.example.invalid",
  UPSTASH_REDIS_REST_TOKEN: "token"
};

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

test("a complete production configuration is ready", () => {
  assert.equal(loadConfig(productionEnv, issuer).ready, true);
});

test("production fails closed when a required setting is missing", () => {
  for (const missing of ["CHALLENGE_SECRET", "UPSTASH_REDIS_REST_URL"]) {
    const env = { ...productionEnv, [missing]: "" };
    assert.equal(loadConfig(env, issuer).ready, false, missing);
  }
  assert.equal(loadConfig(productionEnv, null).ready, false);
  assert.equal(
    loadConfig({ ...productionEnv, REQUIRE_ONCHAIN_ISSUER_REGISTRY: "1" }, issuer).ready,
    false
  );
});

test("a partial or invalid issuer registry is not accepted", () => {
  const partial = { ...productionEnv, EVM_RPC_URL: "https://rpc.example.invalid" };
  assert.equal(loadConfig(partial, issuer).ready, false);
  const invalid = { ...partial, ISSUER_REGISTRY_ADDRESS: "0x123" };
  assert.equal(loadConfig(invalid, issuer).chainRegistryConfigured, false);
  const valid = { ...partial, ISSUER_REGISTRY_ADDRESS: `0x${"a".repeat(40)}` };
  assert.equal(loadConfig(valid, null).ready, true);
});

test("development secrets are random and never hard-coded", () => {
  const first = loadConfig({}, issuer).challengeSecret;
  const second = loadConfig({}, issuer).challengeSecret;
  assert.equal(first.length, 64);
  assert.notEqual(first, second);
  assert.equal(loadConfig({ NODE_ENV: "production" }, issuer).challengeSecret, null);
});

test("the public reset endpoint cannot be enabled on Vercel production", () => {
  assert.equal(loadConfig({}, issuer).demoMode, true);
  assert.equal(loadConfig(productionEnv, issuer).demoMode, false);
  assert.equal(loadConfig({ ...productionEnv, AEGIS_DEMO: "1" }, issuer).demoMode, true);
  const vercel = { ...productionEnv, AEGIS_DEMO: "1", VERCEL_ENV: "production" };
  assert.equal(loadConfig(vercel, issuer).demoMode, false);
});

test("forwarding headers are trusted only behind a declared proxy", () => {
  assert.equal(loadConfig({}, issuer).trustProxyHeaders, false);
  assert.equal(loadConfig({ VERCEL: "1" }, issuer).trustProxyHeaders, true);
  assert.equal(loadConfig({ TRUST_PROXY: "1" }, issuer).trustProxyHeaders, true);
});
