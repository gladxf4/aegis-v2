"use strict";

const { config, isValidIssuerKeyHash } = require("./config");

const STORAGE_SLOT_ZERO = `0x${"0".repeat(64)}`;

/**
 * Returns the active issuer registry mode string ('config', 'sepolia', or 'evm-<chainId>').
 * @returns {string}
 */
function registryMode() {
  if (!config.chainRegistryConfigured) {
    return "config";
  }
  return config.evmChainId === "11155111" ? "sepolia" : `evm-${config.evmChainId}`;
}

/**
 * Executes a JSON-RPC 2.0 call against the configured EVM RPC node.
 * @param {string} method - JSON-RPC method name
 * @param {Array} params - RPC parameters
 * @returns {Promise<string>} RPC string result
 */
async function rpc(method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(config.evmRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`EVM RPC HTTP ${response.status}`);
    }
    const body = await response.json();
    if (body.error || typeof body.result !== "string") {
      throw new Error("EVM RPC returned an invalid result.");
    }
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the trusted Poseidon issuer public key hash.
 * If an on-chain EVM contract is configured, reads slot 0 via eth_getStorageAt;
 * otherwise falls back to local configuration.
 *
 * @returns {Promise<string>} Decimal string of the trusted key hash
 */
async function getTrustedIssuerHash() {
  if (!config.chainRegistryConfigured) {
    if (config.requireOnchainIssuerRegistry && config.nodeEnv === "production") {
      throw new Error("An on-chain issuer registry is required but not configured.");
    }
    if (!isValidIssuerKeyHash(config.issuerKeyHash)) {
      throw new Error("Configured issuer key hash is invalid.");
    }
    return config.issuerKeyHash;
  }

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

module.exports = { getTrustedIssuerHash, registryMode };
