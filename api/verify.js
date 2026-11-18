"use strict";

const snarkjs = require("snarkjs");
const verificationKey = require("../circuits/build/age_proof_verification_key.json");
const { config, FIELD_MODULUS } = require("../lib/config");
const { verifyChallenge } = require("../lib/challenge");
const { getStore } = require("../lib/store");
const { sendJson, methodNotAllowed, getBody } = require("../lib/http");
const { enforceRateLimit } = require("../lib/rate-limit");
const { getTrustedIssuerHash, registryMode } = require("../lib/issuer-registry");

const MAX_PROOF_PAYLOAD_BYTES = 256 * 1024;

function fail(res, status, code, message, extra = {}) {
  return sendJson(res, status, { verified: false, error: code, message, ...extra });
}

/**
 * Proof verification handler.
 * Verifies single-use challenge token, scalar field signals, trusted issuer key hash,
 * Groth16 cryptographic proof, and enforces replay + duplicate nullifier prevention.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }
  if (!config.ready) {
    return fail(res, 503, "SERVER_NOT_CONFIGURED", "The verifier is not configured.");
  }

  try {
    const allowed = await enforceRateLimit(req, res, {
      scope: "verify",
      limit: 20,
      windowSeconds: 60
    });
    if (!allowed) {
      return;
    }
  } catch (error) {
    console.error("rate limiter unavailable:", error.message);
    return fail(res, 503, "STORE_UNAVAILABLE", "The verifier state store is unavailable.");
  }

  let body;
  try {
    body = getBody(req);
  } catch (error) {
    return fail(res, 400, "MALFORMED_BODY", "Request body is not valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(res, 400, "MALFORMED_BODY", "Request body must be a JSON object.");
  }

  const { token, proof, publicSignals } = body;
  if (
    typeof token !== "string" ||
    !proof ||
    typeof proof !== "object" ||
    Array.isArray(proof) ||
    !Array.isArray(publicSignals) ||
    publicSignals.length !== 5
  ) {
    return fail(
      res,
      400,
      "MALFORMED_PROOF",
      "Expected token string, proof object, and five public signals."
    );
  }
  if (Buffer.byteLength(JSON.stringify({ proof, publicSignals })) > MAX_PROOF_PAYLOAD_BYTES) {
    return fail(res, 413, "PROOF_TOO_LARGE", "Proof payload exceeds the 256 KB request limit.");
  }

  const challenge = verifyChallenge(token);
  if (!challenge.ok) {
    return fail(res, 400, challenge.code, challenge.message);
  }

  let trustedIssuerHash;
  try {
    trustedIssuerHash = await getTrustedIssuerHash();
  } catch (error) {
    console.error("issuer registry unavailable:", error.message);
    return fail(
      res,
      503,
      "ISSUER_REGISTRY_UNAVAILABLE",
      "The trusted issuer registry is unavailable."
    );
  }

  const [nullifier, refDate, appId, nonce, issuerHash] = publicSignals.map(String);

  for (const signal of [nullifier, refDate, appId, nonce, issuerHash]) {
    if (!/^[0-9]+$/.test(signal) || signal.length > 77 || BigInt(signal) >= FIELD_MODULUS) {
      return fail(res, 400, "MALFORMED_PROOF", "Public signal is not a valid field element.");
    }
  }
  if (refDate !== challenge.payload.ref_date) {
    return fail(
      res,
      400,
      "REF_DATE_MISMATCH",
      "Proof reference date does not match the challenge."
    );
  }
  if (appId !== challenge.payload.app_id) {
    return fail(res, 400, "APP_MISMATCH", "Proof was generated for a different application.");
  }
  if (nonce !== challenge.payload.nonce) {
    return fail(res, 400, "NONCE_MISMATCH", "Proof was generated for a different challenge nonce.");
  }
  if (
    issuerHash !== trustedIssuerHash ||
    issuerHash !== String(challenge.payload.issuer_key_hash)
  ) {
    return fail(res, 400, "UNTRUSTED_ISSUER", "Issuer key is not on the trusted list.");
  }

  const started = process.hrtime.bigint();
  let valid = false;
  try {
    valid = await snarkjs.groth16.verify(verificationKey, publicSignals.map(String), proof);
  } catch (error) {
    return fail(res, 400, "MALFORMED_PROOF", "Proof could not be parsed.");
  }
  const verifyMs = Number(process.hrtime.bigint() - started) / 1e6;

  if (!valid) {
    return fail(res, 400, "PROOF_INVALID", "Groth16 verification failed.");
  }

  const store = getStore();
  try {
    const remaining = Math.max(1, challenge.payload.exp - Math.floor(Date.now() / 1000));
    const outcome = await store.consumeProof(challenge.payload.cid, remaining, appId, nullifier);
    if (outcome === "challenge_used") {
      return fail(res, 409, "CHALLENGE_USED", "This challenge has already been used.");
    }
    if (outcome === "duplicate_nullifier") {
      return fail(
        res,
        409,
        "DUPLICATE_NULLIFIER",
        "This credential has already been verified for this application."
      );
    }
    if (outcome !== "accepted") {
      throw new Error("State store returned an unknown verification outcome.");
    }
  } catch (error) {
    console.error("store error:", error.message);
    return fail(res, 503, "STORE_UNAVAILABLE", "The verifier state store is unavailable.");
  }

  const verifiedAt = new Date().toISOString();
  return sendJson(res, 200, {
    verified: true,
    policy: "AegisID-KYC-Age-v1",
    claims: { kyc_verified: true, age_over_18: true },
    issuer_registry: registryMode(),
    challenge_id: challenge.payload.cid,
    nullifier,
    ref_date: refDate,
    app_id: appId,
    issuer_key_hash: issuerHash,
    verify_ms: Math.round(verifyMs * 100) / 100,
    store: store.backend,
    verified_at: verifiedAt
  });
};
