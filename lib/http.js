"use strict";

/**
 * Sends a JSON response with strict security headers and correct content length.
 * @param {import("http").ServerResponse} res
 * @param {number} status - HTTP status code
 * @param {object} body - JSON payload
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

/**
 * Sends a 405 Method Not Allowed response with the Allow header.
 * @param {import("http").ServerResponse} res
 * @param {string[]} allowed - Allowed HTTP methods
 */
function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, {
    error: "METHOD_NOT_ALLOWED",
    message: `Use ${allowed.join(" or ")}.`
  });
}

/**
 * Safely extracts and parses the JSON request body.
 * @param {import("http").IncomingMessage} req
 * @returns {object|null}
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
 * Extracts a query parameter value from an incoming request.
 * @param {import("http").IncomingMessage} req
 * @param {string} key
 * @returns {string|null}
 */
function queryValue(req, key) {
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, key)) {
    const value = req.query[key];
    return Array.isArray(value) ? value[0] : value;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key);
  } catch (error) {
    return null;
  }
}

/**
 * Resolves the full URL from request URL and Host header.
 * @param {import("http").IncomingMessage} req
 * @returns {URL}
 */
function requestUrl(req) {
  try {
    return new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (error) {
    return new URL("http://localhost/");
  }
}

module.exports = { sendJson, methodNotAllowed, getBody, queryValue, requestUrl };
