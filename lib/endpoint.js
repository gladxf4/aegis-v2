"use strict";

const { config } = require("./config");
const { ApiError, sendJson, methodNotAllowed } = require("./http");
const { enforceRateLimit } = require("./rate-limit");
const { StoreError } = require("./store");

function toApiError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof StoreError) {
    console.error("state store error:", error.message);
    return new ApiError(503, "STORE_UNAVAILABLE", "The verifier state store is unavailable.");
  }
  console.error("unexpected request error:", error.message);
  return new ApiError(500, "INTERNAL_ERROR", "The request could not be completed.");
}

/**
 * Wraps endpoint logic with the checks every API route shares: allowed methods,
 * feature availability, verifier readiness, rate limiting, and error mapping.
 *
 * @param {object} definition
 * @param {string[]} definition.methods Allowed HTTP methods
 * @param {(req: object) => Promise<{ status?: number, body: object }>} definition.handle
 * @param {{ scope: string, limit: number, windowSeconds: number }} [definition.rateLimit]
 * @param {boolean} [definition.requireReady] Reject requests until configuration is valid
 * @param {() => boolean} [definition.isEnabled] Respond 404 when this returns false
 * @param {object} [definition.errorFields] Extra fields merged into every error response
 * @returns {(req: object, res: object) => Promise<void>}
 */
function defineEndpoint({
  methods,
  handle,
  rateLimit,
  requireReady = true,
  isEnabled = () => true,
  errorFields = {}
}) {
  return async function endpoint(req, res) {
    if (!methods.includes(req.method)) {
      methodNotAllowed(res, methods);
      return;
    }

    try {
      if (!isEnabled()) {
        throw new ApiError(404, "NOT_FOUND", "This endpoint is not available.");
      }
      if (requireReady && !config.ready) {
        throw new ApiError(503, "SERVER_NOT_CONFIGURED", "The verifier is not configured.");
      }
      if (rateLimit && !(await enforceRateLimit(req, res, rateLimit))) {
        return;
      }
      const { status = 200, body } = await handle(req);
      sendJson(res, status, body);
    } catch (error) {
      const failure = toApiError(error);
      sendJson(res, failure.status, {
        ...errorFields,
        error: failure.code,
        message: failure.message
      });
    }
  };
}

module.exports = { defineEndpoint };
