"use strict";

const { config } = require("../lib/config");
const { getStore } = require("../lib/store");
const { sendJson, methodNotAllowed } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }
  if (!config.demoMode) {
    return sendJson(res, 404, { error: "NOT_FOUND" });
  }

  const store = getStore();
  try {
    const cleared = await store.reset(config.appId);
    return sendJson(res, 200, { reset: true, cleared_nullifiers: cleared, store: store.backend });
  } catch (error) {
    console.error("store error:", error.message);
    return sendJson(res, 503, { error: "STORE_UNAVAILABLE" });
  }
};
