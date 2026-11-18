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
    shared_store_configured: config.sharedStoreConfigured,
    shared_store_required: process.env.NODE_ENV === "production",
    rate_limits: { challenge_per_minute: 60, verify_per_minute: 20, sample_per_minute: 30 },
    rate_limit_scope: store.backend === "redis" ? "shared" : "instance-local",
    demo_mode: config.demoMode
  });
};
