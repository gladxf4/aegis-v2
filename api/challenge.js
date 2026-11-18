"use strict";

const { config, RATE_LIMITS } = require("../lib/config");
const { createChallenge } = require("../lib/challenge");
const { defineEndpoint } = require("../lib/endpoint");
const { ApiError } = require("../lib/http");
const { getTrustedIssuerHash, registryMode } = require("../lib/issuer-registry");
const { getStore } = require("../lib/store");

async function readIssuerHash() {
  try {
    return await getTrustedIssuerHash();
  } catch (error) {
    console.error("issuer registry unavailable:", error.message);
    throw new ApiError(
      503,
      "ISSUER_REGISTRY_UNAVAILABLE",
      "The trusted issuer registry is unavailable."
    );
  }
}

/** GET /api/challenge: issues a short-lived, single-use signed challenge. */
module.exports = defineEndpoint({
  methods: ["GET"],
  rateLimit: RATE_LIMITS.challenge,
  async handle() {
    const issuerKeyHash = await readIssuerHash();
    const challenge = createChallenge({ issuerKeyHash });
    return {
      body: {
        token: challenge.token,
        challenge: challenge.public,
        verifier: {
          app_name: config.appName,
          app_id: config.appId,
          issuer_key_hash: issuerKeyHash,
          issuer_registry: registryMode(),
          issuer_registry_address: config.issuerRegistryAddress,
          evm_chain_id: config.chainRegistryConfigured ? config.evmChainId : null,
          store: getStore().backend
        }
      }
    };
  }
});
