"use strict";

const crypto = require("crypto");
const { config } = require("../lib/config");
const sampleSet = require("../config/demo-samples.json");
const { sendJson, methodNotAllowed, queryValue } = require("../lib/http");
const { enforceRateLimit } = require("../lib/rate-limit");

/**
 * Synthetic demo sample credential endpoint.
 * Returns a signed synthetic credential from the pre-generated pool for demonstration.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }
  if (!config.ready) {
    return sendJson(res, 503, {
      error: "SERVER_NOT_CONFIGURED",
      message: "The verifier is not configured for demo samples."
    });
  }

  try {
    const allowed = await enforceRateLimit(req, res, {
      scope: "demo-sample",
      limit: 30,
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

  const credentials = sampleSet.credentials;
  if (!Array.isArray(credentials) || credentials.length === 0) {
    return sendJson(res, 503, {
      error: "DEMO_SAMPLES_UNAVAILABLE",
      message: "No demo credentials are available. Import a signed credential instead."
    });
  }

  const excludedUid = String(queryValue(req, "exclude") || "");
  let sample = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = credentials[crypto.randomInt(credentials.length)];
    if (candidate.uid !== excludedUid || credentials.length === 1) {
      sample = candidate;
      break;
    }
  }
  sample ||= credentials.find((candidate) => candidate.uid !== excludedUid) || credentials[0];

  return sendJson(res, 200, {
    credential: {
      ...sample,
      issuer: sampleSet.issuer,
      kind: "sample"
    },
    pool_size: credentials.length
  });
};
