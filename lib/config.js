"use strict";

const crypto = require("crypto");
const { version } = require("../package.json");

/**
 * BN254 (alt_bn128) scalar field modulus. Every Circom signal and public input
 * is an element of this field.
 */
const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const DEFAULT_CHALLENGE_TTL_SECONDS = 300;
const MAX_CHALLENGE_TTL_SECONDS = 3600;
const MIN_PRODUCTION_SECRET_BYTES = 32;
const SEPOLIA_CHAIN_ID = "11155111";

const RATE_LIMITS = Object.freeze({
  challenge: Object.freeze({ scope: "challenge", limit: 60, windowSeconds: 60 }),
  verify: Object.freeze({ scope: "verify", limit: 20, windowSeconds: 60 }),
  demoSample: Object.freeze({ scope: "demo-sample", limit: 30, windowSeconds: 60 }),
  reset: Object.freeze({ scope: "reset", limit: 10, windowSeconds: 60 })
});

// A static require keeps the file in the serverless bundle. The verifier reports
// a not-configured state instead of crashing when the file has not been generated.
let bundledIssuer = null;
try {
  bundledIssuer = require("../config/issuer.json");
} catch (error) {
  bundledIssuer = null;
}

function isValidIssuerKeyHash(value) {
  if (typeof value !== "string" || !/^[0-9]{1,77}$/.test(value)) {
    return false;
  }
  const hash = BigInt(value);
  return hash > 0n && hash < FIELD_MODULUS;
}

function isChallengeSecretValid(secret, nodeEnv) {
  return (
    typeof secret === "string" &&
    secret.length > 0 &&
    (nodeEnv !== "production" || Buffer.byteLength(secret, "utf8") >= MIN_PRODUCTION_SECRET_BYTES)
  );
}

function normalizeChallengeTtl(value) {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    return DEFAULT_CHALLENGE_TTL_SECONDS;
  }
  return Math.min(seconds, MAX_CHALLENGE_TTL_SECONDS);
}

/**
 * Reduces an application name into a non-zero BN254 scalar field element.
 *
 * @param {string|number} value
 * @returns {string} Decimal field element
 */
function fieldFromString(value) {
  const digest = crypto.createHash("sha256").update(String(value)).digest("hex");
  const element = BigInt(`0x${digest}`) % FIELD_MODULUS;
  return (element === 0n ? 1n : element).toString();
}

/**
 * Reads the shared-store credentials, accepting Upstash and Vercel KV names.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ url: string|undefined, token: string|undefined }}
 */
function readRedisSettings(env = process.env) {
  return {
    url: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  };
}

function readRegistrySettings(env) {
  const address = env.ISSUER_REGISTRY_ADDRESS || null;
  const rpcUrl = env.EVM_RPC_URL || null;
  const chainId = env.EVM_CHAIN_ID || SEPOLIA_CHAIN_ID;
  const present = Boolean(address || rpcUrl);
  const valid =
    !present ||
    Boolean(address && /^0x[0-9a-fA-F]{40}$/.test(address) && rpcUrl && /^[1-9]\d*$/.test(chainId));
  return { address, rpcUrl, chainId, valid, configured: Boolean(valid && address && rpcUrl) };
}

/**
 * Builds the verifier configuration. Production fails closed: it never falls back
 * to a generated secret, process-local state, or the demo reset endpoint.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {object|null} [issuer] Public issuer metadata
 * @returns {object}
 */
function loadConfig(env = process.env, issuer = bundledIssuer) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const appName = env.APP_ID || "aegisid-web";
  const issuerKeyHash = env.ISSUER_KEY_HASH || issuer?.keyHash || null;
  // Outside production each process signs with its own random key, so no usable
  // default secret exists in the source tree.
  const challengeSecret =
    env.CHALLENGE_SECRET || (isProduction ? null : crypto.randomBytes(32).toString("hex"));
  const challengeSecretValid = isChallengeSecretValid(challengeSecret, nodeEnv);
  const redis = readRedisSettings(env);
  const sharedStoreConfigured = Boolean(redis.url && redis.token);
  const registry = readRegistrySettings(env);
  const requireOnchainIssuerRegistry = env.REQUIRE_ONCHAIN_ISSUER_REGISTRY === "1";

  return {
    version,
    appName,
    appId: fieldFromString(appName),
    issuerKeyHash,
    challengeSecret,
    challengeSecretValid,
    challengeTtlSeconds: normalizeChallengeTtl(
      env.CHALLENGE_TTL_SECONDS || DEFAULT_CHALLENGE_TTL_SECONDS
    ),
    sharedStoreConfigured,
    nodeEnv,
    issuerRegistryAddress: registry.address,
    evmRpcUrl: registry.rpcUrl,
    evmChainId: registry.chainId,
    chainRegistryConfigured: registry.configured,
    requireOnchainIssuerRegistry,
    // Forwarding headers can be forged unless a trusted platform overwrites them.
    trustProxyHeaders: Boolean(env.VERCEL) || env.TRUST_PROXY === "1",
    // The reset endpoint is public, so a Vercel production deployment can never enable it.
    demoMode: !isProduction || (env.AEGIS_DEMO === "1" && env.VERCEL_ENV !== "production"),
    ready: Boolean(
      challengeSecretValid &&
      (isValidIssuerKeyHash(issuerKeyHash) || registry.configured) &&
      (!isProduction || sharedStoreConfigured) &&
      registry.valid &&
      (!isProduction || !requireOnchainIssuerRegistry || registry.configured)
    )
  };
}

const config = loadConfig();

module.exports = {
  config,
  loadConfig,
  readRedisSettings,
  fieldFromString,
  FIELD_MODULUS,
  RATE_LIMITS,
  SEPOLIA_CHAIN_ID,
  isValidIssuerKeyHash,
  isChallengeSecretValid,
  normalizeChallengeTtl
};
