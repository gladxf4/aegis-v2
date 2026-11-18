"use strict";

const crypto = require("crypto");
const { config, isValidIssuerKeyHash } = require("./config");

const MAX_TOKEN_LENGTH = 2048;
const MAX_CLOCK_SKEW_MS = 60_000;

/**
 * Converts a buffer or string into a base64url encoded string.
 * @param {Buffer|string} value
 * @returns {string}
 */
function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

/**
 * Signs a payload body using HMAC-SHA256.
 * @param {string} body
 * @param {string} secret
 * @returns {Buffer}
 */
function sign(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest();
}

/**
 * Encodes a payload object into a compact signed token string: base64url(json).base64url(sig).
 * @param {object} payload
 * @param {string} secret
 * @returns {string}
 */
function encode(payload, secret) {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${base64url(sign(body, secret))}`;
}

/**
 * Formats a timestamp into a UTC date string: YYYYMMDD.
 * @param {number|Date} now
 * @returns {string}
 */
function utcDate(now) {
  const date = new Date(now);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");
}

/**
 * Generates a stateless HMAC-signed challenge token with nonce, application ID,
 * reference date, and expiry timestamp.
 *
 * @param {object} [options={}]
 * @param {number} [options.now]
 * @param {number} [options.ttlSeconds]
 * @param {string} [options.appId]
 * @param {string} [options.issuerKeyHash]
 * @param {string} [options.secret]
 * @returns {{ token: string, payload: object, public: object }}
 */
function createChallenge(options = {}) {
  const now = options.now || Date.now();
  const ttlSeconds = options.ttlSeconds || config.challengeTtlSeconds;
  const appId = options.appId || config.appId;
  const issuerKeyHash =
    options.issuerKeyHash !== undefined ? options.issuerKeyHash : config.issuerKeyHash;
  const secret = options.secret === undefined ? config.challengeSecret : options.secret;

  if (!secret) {
    throw new Error("CHALLENGE_SECRET is not set");
  }
  if (!isValidIssuerKeyHash(issuerKeyHash)) {
    throw new Error("Trusted issuer key hash is invalid.");
  }

  const payload = {
    v: 1,
    cid: crypto.randomUUID(),
    nonce: BigInt(`0x${crypto.randomBytes(16).toString("hex")}`).toString(),
    app_id: String(appId),
    issuer_key_hash: String(issuerKeyHash),
    ref_date: utcDate(now),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds
  };

  return {
    token: encode(payload, secret),
    payload,
    public: {
      id: payload.cid,
      nonce: payload.nonce,
      app_id: payload.app_id,
      issuer_key_hash: payload.issuer_key_hash,
      ref_date: payload.ref_date,
      issued_at: new Date(payload.iat * 1000).toISOString(),
      expires_at: new Date(payload.exp * 1000).toISOString(),
      ttl_seconds: ttlSeconds
    }
  };
}

function rejected(code, message) {
  return { ok: false, code, message };
}

function isChallengePayload(payload) {
  return (
    payload !== null &&
    typeof payload === "object" &&
    payload.v === 1 &&
    typeof payload.cid === "string" &&
    typeof payload.app_id === "string" &&
    typeof payload.nonce === "string" &&
    /^[0-9]{1,39}$/.test(payload.nonce) &&
    typeof payload.ref_date === "string" &&
    /^[0-9]{8}$/.test(payload.ref_date) &&
    isValidIssuerKeyHash(payload.issuer_key_hash) &&
    Number.isInteger(payload.iat) &&
    Number.isInteger(payload.exp)
  );
}

/**
 * Verifies a challenge token's HMAC signature, expiration, and payload structure.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 *
 * @param {string} token
 * @param {object} [options={}]
 * @param {string} [options.secret]
 * @param {string} [options.appId]
 * @param {number} [options.now]
 * @returns {{ ok: true, payload: object } | { ok: false, code: string, message: string }}
 */
function verifyChallenge(token, options = {}) {
  const secret = options.secret === undefined ? config.challengeSecret : options.secret;
  const appId = options.appId || config.appId;
  const now = options.now || Date.now();

  if (!secret) {
    return rejected("SERVER_NOT_CONFIGURED", "Challenge secret is not configured.");
  }
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return rejected("CHALLENGE_INVALID", "Malformed challenge token.");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return rejected("CHALLENGE_INVALID", "Malformed challenge token.");
  }

  const [body, signature] = parts;
  const expected = sign(body, secret);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return rejected("CHALLENGE_INVALID", "Challenge signature is invalid.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (error) {
    return rejected("CHALLENGE_INVALID", "Malformed challenge payload.");
  }
  if (!isChallengePayload(payload)) {
    return rejected("CHALLENGE_INVALID", "Malformed challenge payload.");
  }

  if (payload.app_id !== String(appId)) {
    return rejected("APP_MISMATCH", "Challenge belongs to a different application.");
  }
  if (payload.exp * 1000 <= now) {
    return rejected("CHALLENGE_EXPIRED", "Challenge has expired.");
  }
  if (payload.iat * 1000 > now + MAX_CLOCK_SKEW_MS) {
    return rejected("CHALLENGE_INVALID", "Challenge issue time is in the future.");
  }

  return { ok: true, payload };
}

module.exports = { createChallenge, verifyChallenge, utcDate };
