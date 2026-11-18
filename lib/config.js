"use strict";

const crypto = require("crypto");

// BN254 scalar field modulus. App ids are reduced into this field.
const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function fieldFromString(value) {
  const digest = crypto.createHash("sha256").update(String(value)).digest("hex");
  const n = BigInt(`0x${digest}`) % FIELD_MODULUS;
  return (n === 0n ? 1n : n).toString();
}

// A static require keeps the file in the deployment bundle. The try/catch
// allows the server to report a clear not-configured state when it is absent.
let issuer = null;
try {
  issuer = require("../config/issuer.json");
} catch (error) {
  issuer = null;
}

const appName = process.env.APP_ID || "aegisid-web";
const appId = fieldFromString(appName);
const issuerKeyHash = process.env.ISSUER_KEY_HASH || (issuer && issuer.keyHash) || null;
const challengeSecret =
  process.env.CHALLENGE_SECRET ||
  (process.env.NODE_ENV === "production" ? null : "local-development-only-secret");

const ttlValue = Number(process.env.CHALLENGE_TTL_SECONDS || 300);
const challengeTtlSeconds = Number.isFinite(ttlValue) && ttlValue > 0 ? Math.floor(ttlValue) : 300;
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const sharedStoreConfigured = Boolean(redisUrl && redisToken);
const productionStoreReady = process.env.NODE_ENV !== "production" || sharedStoreConfigured;

const config = {
  version: require("../package.json").version,
  appName,
  appId,
  issuerKeyHash,
  issuer,
  challengeSecret,
  challengeTtlSeconds,
  sharedStoreConfigured,
  demoMode: process.env.AEGIS_DEMO === "1" || process.env.NODE_ENV !== "production",
  ready: Boolean(challengeSecret && issuerKeyHash && productionStoreReady)
};

module.exports = { config, fieldFromString, FIELD_MODULUS };
