"use strict";

const { config } = require("../lib/config");
const { getStore } = require("../lib/store");
const { sendJson, methodNotAllowed } = require("../lib/http");
const { getTrustedIssuerHash, registryMode } = require("../lib/issuer-registry");

/**
 * Health and operational readiness reporting handler.
 * Reports store status, issuer trust status, rate limit scope, and demo mode.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowed(res, ["GET", "HEAD"]);
  }

  const store = getStore();
  const [storeReady, registry] = await Promise.all([
    store.ping(),
    getTrustedIssuerHash()
      .then((issuerKeyHash) => ({ ready: Boolean(issuerKeyHash), issuerKeyHash }))
      .catch(() => ({ ready: false, issuerKeyHash: null }))
  ]);

  return sendJson(res, 200, {
    ok: Boolean(config.ready && storeReady && registry.ready),
    version: config.version,
    app_name: config.appName,
    app_id: config.appId,
    issuer_key_hash: registry.issuerKeyHash,
    issuer_configured: registry.ready,
    issuer_registry: registryMode(),
    issuer_registry_configured: config.chainRegistryConfigured,
    issuer_registry_required: config.requireOnchainIssuerRegistry,
    issuer_registry_address: config.issuerRegistryAddress,
    evm_chain_id: config.chainRegistryConfigured ? config.evmChainId : null,
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
