"use strict";

const { config, RATE_LIMITS } = require("../lib/config");
const { defineEndpoint } = require("../lib/endpoint");
const { getTrustedIssuerHash, registryMode } = require("../lib/issuer-registry");
const { getStore } = require("../lib/store");
const { createTtlCache } = require("../lib/ttl-cache");

// This route is public, so repeated calls must not translate into backend traffic.
const PROBE_CACHE_TTL_MS = 5000;

async function probeDependencies() {
  const [storeReady, issuerKeyHash] = await Promise.all([
    getStore().ping(),
    getTrustedIssuerHash().catch(() => null)
  ]);
  return { storeReady, issuerKeyHash };
}

const probeCache = createTtlCache(probeDependencies, PROBE_CACHE_TTL_MS);

/** GET /api/health: reports readiness; responds 503 until the verifier can serve. */
module.exports = defineEndpoint({
  methods: ["GET", "HEAD"],
  requireReady: false,
  async handle() {
    const { storeReady, issuerKeyHash } = await probeCache.get();
    const store = getStore();
    const issuerConfigured = Boolean(issuerKeyHash);
    const ok = Boolean(config.ready && storeReady && issuerConfigured);

    return {
      status: ok ? 200 : 503,
      body: {
        ok,
        version: config.version,
        app_name: config.appName,
        app_id: config.appId,
        issuer_key_hash: issuerKeyHash,
        issuer_configured: issuerConfigured,
        issuer_registry: registryMode(),
        issuer_registry_configured: config.chainRegistryConfigured,
        issuer_registry_required: config.requireOnchainIssuerRegistry,
        issuer_registry_address: config.issuerRegistryAddress,
        evm_chain_id: config.chainRegistryConfigured ? config.evmChainId : null,
        challenge_configured: config.challengeSecretValid,
        challenge_ttl_seconds: config.challengeTtlSeconds,
        store: store.backend,
        store_ready: storeReady,
        shared_store_configured: config.sharedStoreConfigured,
        shared_store_required: config.nodeEnv === "production",
        rate_limits: {
          challenge_per_minute: RATE_LIMITS.challenge.limit,
          verify_per_minute: RATE_LIMITS.verify.limit,
          sample_per_minute: RATE_LIMITS.demoSample.limit
        },
        rate_limit_scope: store.backend === "redis" ? "shared" : "instance-local",
        demo_mode: config.demoMode
      }
    };
  }
});
