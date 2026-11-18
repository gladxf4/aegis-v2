"use strict";

const { config, isValidIssuerKeyHash, SEPOLIA_CHAIN_ID } = require("./config");
const { createTtlCache } = require("./ttl-cache");

const STORAGE_SLOT_ZERO = `0x${"0".repeat(64)}`;
const RPC_TIMEOUT_MS = 5000;
// Bounds both RPC traffic and how long a rotated issuer key stays trusted.
const REGISTRY_CACHE_TTL_MS = 30_000;

/**
 * @returns {string} "config", "sepolia", or "evm-<chainId>"
 */
function registryMode() {
  if (!config.chainRegistryConfigured) {
    return "config";
  }
  return config.evmChainId === SEPOLIA_CHAIN_ID ? "sepolia" : `evm-${config.evmChainId}`;
}

async function rpc(method, params) {
  const response = await fetch(config.evmRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`EVM RPC HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.error || typeof body.result !== "string") {
    throw new Error("EVM RPC returned an invalid result.");
  }
  return body.result;
}

async function readRegistryHash() {
  const chainId = await rpc("eth_chainId", []);
  if (BigInt(chainId) !== BigInt(config.evmChainId)) {
    throw new Error("EVM RPC is connected to the wrong chain.");
  }

  const storage = await rpc("eth_getStorageAt", [
    config.issuerRegistryAddress,
    STORAGE_SLOT_ZERO,
    "latest"
  ]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(storage)) {
    throw new Error("Issuer registry returned an invalid key hash.");
  }
  const hash = BigInt(storage).toString();
  if (!isValidIssuerKeyHash(hash)) {
    throw new Error("Issuer registry has no active issuer key.");
  }
  return hash;
}

const registryCache = createTtlCache(readRegistryHash, REGISTRY_CACHE_TTL_MS);

/**
 * Resolves the trusted issuer key hash from the on-chain registry when one is
 * configured, otherwise from local configuration.
 *
 * @returns {Promise<string>} Decimal field element
 */
async function getTrustedIssuerHash() {
  if (config.chainRegistryConfigured) {
    return registryCache.get();
  }
  if (config.requireOnchainIssuerRegistry && config.nodeEnv === "production") {
    throw new Error("An on-chain issuer registry is required but not configured.");
  }
  if (!isValidIssuerKeyHash(config.issuerKeyHash)) {
    throw new Error("Configured issuer key hash is invalid.");
  }
  return config.issuerKeyHash;
}

module.exports = {
  getTrustedIssuerHash,
  registryMode,
  clearIssuerCache: registryCache.clear
};
