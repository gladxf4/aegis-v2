"use strict";

const crypto = require("crypto");
const { config } = require("./config");
const { getStore } = require("./store");
const { sendJson } = require("./http");

function clientAddress(req) {
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof forwardedValue === "string" && forwardedValue.length > 0) {
    return forwardedValue.split(",")[0].trim().slice(0, 128);
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

async function enforceRateLimit(req, res, { scope, limit, windowSeconds }) {
  const address = clientAddress(req);
  const digest = crypto
    .createHmac("sha256", config.challengeSecret)
    .update(`${config.appId}\0${scope}\0${address}`)
    .digest("hex");
  const store = getStore();
  const result = await store.consumeRateLimit(digest, limit, windowSeconds);
  const resetAt = Math.floor(Date.now() / 1000) + result.resetInSeconds;

  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(resetAt));

  if (result.allowed) {
    return true;
  }

  res.setHeader("Retry-After", String(result.resetInSeconds));
  sendJson(res, 429, {
    error: "RATE_LIMITED",
    message: "Too many requests. Wait briefly, then try again.",
    retry_after_seconds: result.resetInSeconds
  });
  return false;
}

module.exports = { enforceRateLimit };
