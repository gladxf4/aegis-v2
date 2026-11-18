"use strict";

const { config } = require("../lib/config");
const { getStore } = require("../lib/store");
const { sendJson, methodNotAllowed } = require("../lib/http");
const { enforceRateLimit } = require("../lib/rate-limit");

/**
 * Demo reset handler. Clears nullifiers for the current application.
 * Only available when AEGIS_DEMO=1 or NODE_ENV !== "production".
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }
  if (!config.demoMode) {
    return sendJson(res, 404, {
      error: "NOT_FOUND",
      message: "Reset is only allowed in demo mode."
    });
  }

  try {
    const allowed = await enforceRateLimit(req, res, {
      scope: "reset",
      limit: 10,
      windowSeconds: 60
    });
    if (!allowed) {
      return;
    }
  } catch (error) {
    console.error("rate limiter unavailable:", error.message);
    return sendJson(res, 503, {
      error: "STORE_UNAVAILABLE",
      message: "The verifier state store is unavailable."
    });
  }

  const store = getStore();
  try {
    const cleared = await store.reset(config.appId);
    return sendJson(res, 200, {
      reset: true,
      cleared_nullifiers: cleared,
      store: store.backend
    });
  } catch (error) {
    console.error("store error:", error.message);
    return sendJson(res, 503, {
      error: "STORE_UNAVAILABLE",
      message: "The verifier state store is unavailable."
    });
  }
};
