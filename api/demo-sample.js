"use strict";

const crypto = require("crypto");
const sampleSet = require("../config/demo-samples.json");
const { RATE_LIMITS } = require("../lib/config");
const { defineEndpoint } = require("../lib/endpoint");
const { ApiError, queryValue } = require("../lib/http");

/**
 * Picks a random sample, moving to the next one if it is the excluded credential.
 *
 * @param {object[]} credentials Non-empty sample pool
 * @param {string|null} excludedUid
 * @returns {object}
 */
function pickSample(credentials, excludedUid) {
  const index = crypto.randomInt(credentials.length);
  const candidate = credentials[index];
  return candidate.uid === excludedUid ? credentials[(index + 1) % credentials.length] : candidate;
}

/** GET /api/demo-sample: returns one public, synthetic signed credential. */
module.exports = defineEndpoint({
  methods: ["GET"],
  rateLimit: RATE_LIMITS.demoSample,
  async handle(req) {
    const { credentials, issuer } = sampleSet;
    if (!Array.isArray(credentials) || credentials.length === 0) {
      throw new ApiError(
        503,
        "DEMO_SAMPLES_UNAVAILABLE",
        "No demo credentials are available. Import a signed credential instead."
      );
    }
    const sample = pickSample(credentials, queryValue(req, "exclude"));
    return {
      body: {
        credential: { ...sample, issuer, kind: "sample" },
        pool_size: credentials.length
      }
    };
  }
});
