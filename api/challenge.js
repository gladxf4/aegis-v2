"use strict";

const { config } = require("../lib/config");
const { createChallenge } = require("../lib/challenge");
const { getStore } = require("../lib/store");
const { sendJson, methodNotAllowed } = require("../lib/http");
const { enforceRateLimit } = require("../lib/rate-limit");
const { getTrustedIssuerHash, registryMode } = require("../lib/issuer-registry");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }
  if (!config.ready) {
    return sendJson(res, 503, {
      error: "SERVER_NOT_CONFIGURED",
      message: "The verifier is missing its challenge secret or issuer configuration."
    });
  }

  try {
    const allowed = await enforceRateLimit(req, res, {
      scope: "challenge",
      limit: 60,
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

  let issuerKeyHash;
  try {
    issuerKeyHash = await getTrustedIssuerHash();
  } catch (error) {
    console.error("issuer registry unavailable:", error.message);
    return sendJson(res, 503, {
      error: "ISSUER_REGISTRY_UNAVAILABLE",
      message: "The trusted issuer registry is unavailable."
    });
  }

  const challenge = createChallenge({ issuerKeyHash });
  const store = getStore();

  return sendJson(res, 200, {
    token: challenge.token,
    challenge: challenge.public,
    verifier: {
      app_name: config.appName,
      app_id: config.appId,
      issuer_key_hash: issuerKeyHash,
      issuer_registry: registryMode(),
      issuer_registry_address: config.issuerRegistryAddress,
      evm_chain_id: config.chainRegistryConfigured ? config.evmChainId : null,
      store: store.backend
    }
  });
};
