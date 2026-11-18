"use strict";

const crypto = require("crypto");
const { config } = require("./config");

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest();
}

function encode(payload, secret) {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${base64url(sign(body, secret))}`;
}

function utcDate(now) {
  const date = new Date(now);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");
}

function createChallenge(options = {}) {
  const now = options.now || Date.now();
  const ttlSeconds = options.ttlSeconds || config.challengeTtlSeconds;
  const appId = options.appId || config.appId;
  const secret = options.secret === undefined ? config.challengeSecret : options.secret;

  if (!secret) {
    throw new Error("CHALLENGE_SECRET is not set");
  }

  const payload = {
    v: 1,
    cid: crypto.randomUUID(),
    nonce: BigInt(`0x${crypto.randomBytes(16).toString("hex")}`).toString(),
    app_id: String(appId),
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
      ref_date: payload.ref_date,
      issued_at: new Date(payload.iat * 1000).toISOString(),
      expires_at: new Date(payload.exp * 1000).toISOString(),
      ttl_seconds: ttlSeconds
    }
  };
}

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
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
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
  if (payload.iat * 1000 > now + 60_000) {
    return {
      ok: false,
      code: "CHALLENGE_INVALID",
      message: "Challenge issue time is in the future."
    };
  }

  return { ok: true, payload };
}

module.exports = { createChallenge, verifyChallenge, utcDate };
