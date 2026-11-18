"use strict";

if (process.stdout?.setMaxListeners) {
  process.stdout.setMaxListeners(50);
}
if (process.stderr?.setMaxListeners) {
  process.stderr.setMaxListeners(50);
}

const assert = require("node:assert/strict");
const test = require("node:test");
const { getTrustedIssuerHash, registryMode } = require("../lib/issuer-registry");
const { config } = require("../lib/config");

test("registryMode reports config when chain registry is not configured", () => {
  const original = config.chainRegistryConfigured;
  config.chainRegistryConfigured = false;
  assert.equal(registryMode(), "config");
  config.chainRegistryConfigured = original;
});

test("registryMode reports sepolia for chain 11155111", () => {
  const originalConfigured = config.chainRegistryConfigured;
  const originalChain = config.evmChainId;
  config.chainRegistryConfigured = true;
  config.evmChainId = "11155111";

  assert.equal(registryMode(), "sepolia");

  config.evmChainId = "1";
  assert.equal(registryMode(), "evm-1");

  config.chainRegistryConfigured = originalConfigured;
  config.evmChainId = originalChain;
});

test("getTrustedIssuerHash returns config issuerKeyHash in local/config mode", async () => {
  const originalConfigured = config.chainRegistryConfigured;
  config.chainRegistryConfigured = false;

  const hash = await getTrustedIssuerHash();
  assert.equal(typeof hash, "string");
  assert.equal(hash, config.issuerKeyHash);

  config.chainRegistryConfigured = originalConfigured;
});

test("getTrustedIssuerHash throws when onchain registry is strictly required in production", async () => {
  const originalConfigured = config.chainRegistryConfigured;
  const originalRequired = config.requireOnchainIssuerRegistry;
  const originalEnv = config.nodeEnv;

  config.chainRegistryConfigured = false;
  config.requireOnchainIssuerRegistry = true;
  config.nodeEnv = "production";

  await assert.rejects(
    () => getTrustedIssuerHash(),
    /An on-chain issuer registry is required but not configured/
  );

  config.chainRegistryConfigured = originalConfigured;
  config.requireOnchainIssuerRegistry = originalRequired;
  config.nodeEnv = originalEnv;
});

test("getTrustedIssuerHash queries EVM storage slot when configured", async () => {
  const originalFetch = global.fetch;
  const originalConfigured = config.chainRegistryConfigured;
  const originalAddress = config.issuerRegistryAddress;
  const originalRpc = config.evmRpcUrl;
  const originalChainId = config.evmChainId;

  config.chainRegistryConfigured = true;
  config.issuerRegistryAddress = "0x1234567890123456789012345678901234567890";
  config.evmRpcUrl = "https://mock-rpc.example.invalid";
  config.evmChainId = "11155111";

  // Mock successful chain ID and storage slot
  const expectedHashHex = `0x${"0".repeat(62)}2a`; // 42 in hex (64 chars)
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "eth_chainId") {
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" }) }; // 11155111 in hex
    }
    if (body.method === "eth_getStorageAt") {
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: expectedHashHex }) };
    }
    return { ok: false, status: 400 };
  };

  const hash = await getTrustedIssuerHash();
  assert.equal(hash, "42");

  // Test wrong chain ID
  global.fetch = async (url, options) => {
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x1" }) }; // chain ID 1
  };
  await assert.rejects(() => getTrustedIssuerHash(), /connected to the wrong chain/);

  // Test zero hash
  const zeroHashHex = `0x${"0".repeat(64)}`;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "eth_chainId") {
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" }) };
    }
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: zeroHashHex }) };
  };
  await assert.rejects(() => getTrustedIssuerHash(), /no active issuer key/);

  global.fetch = originalFetch;
  config.chainRegistryConfigured = originalConfigured;
  config.issuerRegistryAddress = originalAddress;
  config.evmRpcUrl = originalRpc;
  config.evmChainId = originalChainId;
});
