"use strict";

const crypto = require("crypto");
const { config, FIELD_MODULUS } = require("./config");

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
  if (
    typeof issuerKeyHash !== "string" ||
    !/^[0-9]+$/.test(issuerKeyHash) ||
    issuerKeyHash.length > 77 ||
    BigInt(issuerKeyHash) >= FIELD_MODULUS
  ) {
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
    return {
      ok: false,
      code: "SERVER_NOT_CONFIGURED",
      message: "Challenge secret is not configured."
    };
  }
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, code: "CHALLENGE_INVALID", message: "Malformed challenge token." };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, code: "CHALLENGE_INVALID", message: "Malformed challenge token." };
  }

  const expected = sign(parts[0], secret);
  let actual;
  try {
    actual = Buffer.from(parts[1], "base64url");
  } catch (error) {
    return { ok: false, code: "CHALLENGE_INVALID", message: "Malformed challenge token." };
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return { ok: false, code: "CHALLENGE_INVALID", message: "Challenge signature is invalid." };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch (error) {
    return { ok: false, code: "CHALLENGE_INVALID", message: "Malformed challenge payload." };
  }

  if (
    payload.v !== 1 ||
    typeof payload.cid !== "string" ||
    !/^[0-9]{1,39}$/.test(String(payload.nonce)) ||
    !/^[0-9]{8}$/.test(String(payload.ref_date)) ||
    !/^[0-9]{1,77}$/.test(String(payload.issuer_key_hash)) ||
    BigInt(payload.issuer_key_hash) >= FIELD_MODULUS ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp)
  ) {
    return { ok: false, code: "CHALLENGE_INVALID", message: "Malformed challenge payload." };
  }

  if (String(payload.app_id) !== String(appId)) {
    return {
      ok: false,
      code: "APP_MISMATCH",
      message: "Challenge belongs to a different application."
    };
  }
  if (payload.exp * 1000 <= now) {
    return { ok: false, code: "CHALLENGE_EXPIRED", message: "Challenge has expired." };
  }
  if (payload.iat * 1000 > now + MAX_CLOCK_SKEW_MS) {
    return {
      ok: false,
      code: "CHALLENGE_INVALID",
      message: "Challenge issue time is in the future."
    };
  }

  return { ok: true, payload };
}

module.exports = { createChallenge, verifyChallenge, utcDate };
