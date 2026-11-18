"use strict";

const { FIELD_MODULUS } = require("./config");
const { ApiError } = require("./http");

const PUBLIC_SIGNAL_COUNT = 5;
const MAX_FIELD_DIGITS = 77;
// BN254 base-field coordinates are also at most 77 decimal digits.
const COORDINATE_PATTERN = /^[0-9]{1,77}$/;
const CANONICAL_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;

function malformedProof(message) {
  return new ApiError(400, "MALFORMED_PROOF", message);
}

/**
 * Accepts only the canonical decimal form of a BN254 scalar. One field element must
 * have one spelling: the proof system reduces "012" and "12" to the same value, so
 * accepting both would let a padded nullifier evade the duplicate check.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isCanonicalFieldElement(value) {
  return (
    typeof value === "string" &&
    value.length <= MAX_FIELD_DIGITS &&
    CANONICAL_DECIMAL_PATTERN.test(value) &&
    BigInt(value) < FIELD_MODULUS
  );
}

function isCoordinateList(value, length) {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "string" && COORDINATE_PATTERN.test(item))
  );
}

function isGroth16Proof(proof) {
  return (
    proof !== null &&
    typeof proof === "object" &&
    proof.protocol === "groth16" &&
    proof.curve === "bn128" &&
    isCoordinateList(proof.pi_a, 3) &&
    Array.isArray(proof.pi_b) &&
    proof.pi_b.length === 3 &&
    proof.pi_b.every((pair) => isCoordinateList(pair, 2)) &&
    isCoordinateList(proof.pi_c, 3)
  );
}

/**
 * Validates the structure of a verification request before any cryptography runs.
 *
 * @param {unknown} body Parsed JSON body
 * @returns {{ token: string, proof: object, publicSignals: string[], signals: object }}
 * @throws {ApiError}
 */
function parseProofRequest(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "MALFORMED_BODY", "Request body must be a JSON object.");
  }

  const { token, proof, publicSignals } = body;
  if (
    typeof token !== "string" ||
    !Array.isArray(publicSignals) ||
    publicSignals.length !== PUBLIC_SIGNAL_COUNT
  ) {
    throw malformedProof("Expected a token string and five public signals.");
  }
  if (!publicSignals.every(isCanonicalFieldElement)) {
    throw malformedProof("Public signals must be canonical field elements.");
  }
  if (!isGroth16Proof(proof)) {
    throw malformedProof("Expected a Groth16 proof on the bn128 curve.");
  }

  const [nullifier, refDate, appId, nonce, issuerHash] = publicSignals;
  return {
    token,
    proof,
    publicSignals,
    signals: { nullifier, refDate, appId, nonce, issuerHash }
  };
}

module.exports = { parseProofRequest, isCanonicalFieldElement };
