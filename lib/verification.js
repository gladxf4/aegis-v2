"use strict";

const snarkjs = require("snarkjs");
const verificationKey = require("../circuits/build/age_proof_verification_key.json");
const { verifyChallenge } = require("./challenge");
const { ApiError, getBody } = require("./http");
const { getTrustedIssuerHash, registryMode } = require("./issuer-registry");
const { parseProofRequest } = require("./proof-request");
const { getStore, StoreError } = require("./store");

const POLICY_ID = "AegisID-KYC-Age-v1";

const STORE_REJECTIONS = {
  challenge_used: new ApiError(409, "CHALLENGE_USED", "This challenge has already been used."),
  duplicate_nullifier: new ApiError(
    409,
    "DUPLICATE_NULLIFIER",
    "This credential has already been verified for this application."
  )
};

function readRequest(req) {
  try {
    return parseProofRequest(getBody(req));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, "MALFORMED_BODY", "Request body is not valid JSON.");
    }
    throw error;
  }
}

function readChallenge(token) {
  const challenge = verifyChallenge(token);
  if (!challenge.ok) {
    throw new ApiError(400, challenge.code, challenge.message);
  }
  return challenge.payload;
}

async function readTrustedIssuer() {
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

function assertSignalsMatchChallenge(signals, challenge, trustedIssuerHash) {
  if (signals.refDate !== challenge.ref_date) {
    throw new ApiError(
      400,
      "REF_DATE_MISMATCH",
      "Proof reference date does not match the challenge."
    );
  }
  if (signals.appId !== challenge.app_id) {
    throw new ApiError(400, "APP_MISMATCH", "Proof was generated for a different application.");
  }
  if (signals.nonce !== challenge.nonce) {
    throw new ApiError(400, "NONCE_MISMATCH", "Proof was generated for a different nonce.");
  }
  if (
    signals.issuerHash !== trustedIssuerHash ||
    signals.issuerHash !== challenge.issuer_key_hash
  ) {
    throw new ApiError(400, "UNTRUSTED_ISSUER", "Issuer key is not on the trusted list.");
  }
}

async function assertValidProof(publicSignals, proof) {
  let valid;
  try {
    valid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
  } catch (error) {
    throw new ApiError(400, "MALFORMED_PROOF", "Proof could not be parsed.");
  }
  if (!valid) {
    throw new ApiError(400, "PROOF_INVALID", "Groth16 verification failed.");
  }
}

async function recordProof(store, challenge, signals) {
  const remainingSeconds = Math.max(1, challenge.exp - Math.floor(Date.now() / 1000));
  const outcome = await store.consumeProof(
    challenge.cid,
    remainingSeconds,
    signals.appId,
    signals.nullifier
  );
  if (outcome !== "accepted") {
    throw STORE_REJECTIONS[outcome] ?? new StoreError("Unknown proof outcome.");
  }
}

/**
 * Runs the full verification sequence. Inexpensive checks come first, and state
 * changes only after the proof is valid, so bad proofs cannot burn a challenge.
 *
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<object>} Verification result for the client
 * @throws {ApiError}
 */
async function verifySubmission(req) {
  const { token, proof, publicSignals, signals } = readRequest(req);
  const challenge = readChallenge(token);
  assertSignalsMatchChallenge(signals, challenge, await readTrustedIssuer());

  const startedAt = performance.now();
  await assertValidProof(publicSignals, proof);
  const verifyMs = performance.now() - startedAt;

  const store = getStore();
  await recordProof(store, challenge, signals);

  return {
    verified: true,
    policy: POLICY_ID,
    claims: { kyc_verified: true, age_over_18: true },
    issuer_registry: registryMode(),
    challenge_id: challenge.cid,
    nullifier: signals.nullifier,
    ref_date: signals.refDate,
    app_id: signals.appId,
    issuer_key_hash: signals.issuerHash,
    verify_ms: Math.round(verifyMs * 100) / 100,
    store: store.backend,
    verified_at: new Date().toISOString()
  };
}

module.exports = { verifySubmission };
