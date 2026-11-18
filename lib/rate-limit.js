"use strict";

const crypto = require("crypto");
const { config } = require("./config");
const { getStore } = require("./store");
const { sendJson } = require("./http");

/**
 * Resolves the client IP address securely, prioritizing platform-trusted headers
 * (such as Vercel's x-real-ip or x-vercel-forwarded-for) before falling back to
 * client-supplied headers or socket remote addresses.
 *
 * @param {import("http").IncomingMessage} req
 * @returns {string} Sanitized client address
 */
function clientAddress(req) {
  const headers = req.headers || {};

  // Vercel and trusted reverse proxies provide the verified client IP in x-real-ip
  const realIp = headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim().length > 0) {
    return realIp.trim().slice(0, 128);
  }

  // Vercel-specific edge forwarded header
  const vercelIp = headers["x-vercel-forwarded-for"];
  const vercelIpVal = Array.isArray(vercelIp) ? vercelIp[0] : vercelIp;
  if (typeof vercelIpVal === "string" && vercelIpVal.trim().length > 0) {
    return vercelIpVal.split(",")[0].trim().slice(0, 128);
  }

  // Standard x-forwarded-for: take leftmost verified entry
  const forwarded = headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof forwardedValue === "string" && forwardedValue.trim().length > 0) {
    return forwardedValue.split(",")[0].trim().slice(0, 128);
  }

  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

/**
 * Enforces per-scope and per-IP rate limits using HMAC-derived keys.
 * Sets standard IETF RateLimit and Retry-After HTTP headers.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {{ scope: string, limit: number, windowSeconds: number }} options
 * @returns {Promise<boolean>} True if within rate limit, false if rejected with 429
 */
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

module.exports = { clientAddress, enforceRateLimit };
