"use strict";

const express = require("express");
const path = require("path");
const securityHeaders = require("../config/security-headers.json");
const { sendJson } = require("../lib/http");

const APP_DIR = path.join(__dirname, "..", "app");
const MAX_BODY_SIZE = "256kb";
// Matches vercel.json. Artifact names are stable, so they must be able to revalidate.
const LONG_LIVED_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const LONG_LIVED_DIRECTORIES = [`${path.sep}artifacts${path.sep}`, `${path.sep}vendor${path.sep}`];

// Handlers are registered for every method so they can answer 405 themselves.
const API_ROUTES = {
  "/api/challenge": require("../api/challenge"),
  "/api/demo-sample": require("../api/demo-sample"),
  "/api/health": require("../api/health"),
  "/api/reset": require("../api/reset"),
  "/api/verify": require("../api/verify")
};

const BODY_ERRORS = {
  "entity.parse.failed": [400, "MALFORMED_BODY", "Request body is not valid JSON."],
  "entity.too.large": [413, "BODY_TOO_LARGE", "Request body exceeds the configured limit."]
};

function applySecurityHeaders(req, res, next) {
  for (const { key, value } of securityHeaders) {
    res.setHeader(key, value);
  }
  next();
}

function setStaticCacheHeaders(res, filePath) {
  const longLived = LONG_LIVED_DIRECTORIES.some((directory) => filePath.includes(directory));
  res.setHeader("Cache-Control", longLived ? LONG_LIVED_CACHE : "no-cache");
}

function handleError(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }
  const known = BODY_ERRORS[error.type];
  if (known) {
    const [status, code, message] = known;
    sendJson(res, status, { error: code, message });
    return;
  }
  console.error("request error:", error.message);
  sendJson(res, 500, { error: "INTERNAL_ERROR", message: "The request could not be completed." });
}

/**
 * Builds the local server, which mirrors the Vercel routes and security headers.
 *
 * @returns {import("express").Express}
 */
function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(applySecurityHeaders);
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  for (const [route, handler] of Object.entries(API_ROUTES)) {
    app.all(route, handler);
  }
  app.use("/api", (req, res) => {
    sendJson(res, 404, { error: "NOT_FOUND", message: "Unknown API route." });
  });

  app.use(express.static(APP_DIR, { setHeaders: setStaticCacheHeaders }));
  app.use(handleError);
  return app;
}

module.exports = { createApp };
