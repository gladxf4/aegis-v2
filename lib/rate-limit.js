"use strict";

const crypto = require("crypto");
const { config } = require("./config");
const { getStore } = require("./store");
const { sendJson } = require("./http");

const MAX_ADDRESS_LENGTH = 128;
const PROXY_ADDRESS_HEADERS = ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"];

function firstAddress(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") {
    return "";
  }
  return value.split(",")[0].trim().slice(0, MAX_ADDRESS_LENGTH);
}

/**
 * Resolves the client address used for rate limiting. Forwarding headers count
 * only behind a trusted proxy; elsewhere a client could forge them to evade limits.
 *
 * @param {import("http").IncomingMessage} req
 * @returns {string}
 */
function clientAddress(req) {
  if (config.trustProxyHeaders) {
    for (const name of PROXY_ADDRESS_HEADERS) {
      const address = firstAddress(req.headers?.[name]);
      if (address) {
        return address;
      }
    }
  }
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Applies a fixed-window limit per scope and client. Addresses are stored only as
 * keyed hashes. Sends the 429 response itself when the limit is exceeded.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {{ scope: string, limit: number, windowSeconds: number }} options
 * @returns {Promise<boolean>} True when the request may continue
 */
async function enforceRateLimit(req, res, { scope, limit, windowSeconds }) {
  const digest = crypto
    .createHmac("sha256", config.challengeSecret)
    .update(`${config.appId}\0${scope}\0${clientAddress(req)}`)
    .digest("hex");
  const result = await getStore().consumeRateLimit(digest, limit, windowSeconds);

  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.floor(Date.now() / 1000) + result.resetInSeconds));

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
