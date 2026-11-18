"use strict";

/**
 * An expected request failure that maps directly to a JSON error response.
 */
class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code Stable machine-readable error code
   * @param {string} message Safe, user-facing description
   */
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Sends an uncacheable JSON response.
 *
 * @param {import("http").ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(res.req?.method === "HEAD" ? undefined : payload);
}

/**
 * @param {import("http").ServerResponse} res
 * @param {string[]} allowed
 */
function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, {
    error: "METHOD_NOT_ALLOWED",
    message: `Use ${allowed.join(" or ")}.`
  });
}

/**
 * Returns the parsed JSON body from Express or a Vercel function request.
 *
 * @param {import("http").IncomingMessage & { body?: unknown }} req
 * @returns {object|null}
 * @throws {SyntaxError} When a string body is not valid JSON
 */
function getBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body);
  }
  return null;
}

/**
 * Reads one query parameter, using the first value when it is repeated.
 *
 * @param {import("http").IncomingMessage & { query?: object }} req
 * @param {string} key
 * @returns {string|null}
 */
function queryValue(req, key) {
  if (req.query && Object.hasOwn(req.query, key)) {
    const value = req.query[key];
    return Array.isArray(value) ? value[0] : value;
  }
  try {
    return new URL(req.url, "http://localhost").searchParams.get(key);
  } catch (error) {
    return null;
  }
}

module.exports = { ApiError, sendJson, methodNotAllowed, getBody, queryValue };
