"use strict";

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, {
    error: "METHOD_NOT_ALLOWED",
    message: `Use ${allowed.join(" or ")}.`
  });
}

function getBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body);
  }
  return null;
}

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

function requestUrl(req) {
  try {
    return new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (error) {
    return new URL("http://localhost/");
  }
}

module.exports = { sendJson, methodNotAllowed, getBody, queryValue, requestUrl };
