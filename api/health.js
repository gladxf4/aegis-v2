"use strict";

const { config } = require("../lib/config");
const { getStore } = require("../lib/store");
const { sendJson, methodNotAllowed } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const store = getStore();
  const storeReady = await store.ping();

  return sendJson(res, 200, {
    ok: Boolean(config.ready && storeReady),
    version: config.version,
    app_name: config.appName,
    app_id: config.appId,
    issuer_key_hash: config.issuerKeyHash,
    issuer_configured: Boolean(config.issuerKeyHash),
    challenge_configured: Boolean(config.challengeSecret),
    challenge_ttl_seconds: config.challengeTtlSeconds,
    store: store.backend,
    store_ready: storeReady,
    demo_mode: config.demoMode
  });
};
