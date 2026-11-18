"use strict";

const express = require("express");
const path = require("path");
const challenge = require("../api/challenge");
const verify = require("../api/verify");
const health = require("../api/health");
const reset = require("../api/reset");
const demoSample = require("../api/demo-sample");
const { sendJson } = require("../lib/http");

const appDir = path.join(__dirname, "..", "app");

function wrap(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  // Register every method on each path so the handlers can return 405
  // instead of Express falling through to a generic 404.
  app.all("/api/challenge", wrap(challenge));
  app.all("/api/verify", wrap(verify));
  app.all("/api/health", wrap(health));
  app.all("/api/reset", wrap(reset));
  app.all("/api/demo-sample", wrap(demoSample));

  app.use("/api", (req, res) => {
    sendJson(res, 404, { error: "NOT_FOUND" });
  });

  app.use(
    express.static(appDir, {
      index: "index.html",
      maxAge: "1h",
      setHeaders(res, filePath) {
        if (
          filePath.includes(`${path.sep}artifacts${path.sep}`) ||
          filePath.includes(`${path.sep}vendor${path.sep}`)
        ) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    })
  );

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error.type === "entity.parse.failed") {
      return sendJson(res, 400, {
        error: "MALFORMED_BODY",
        message: "Request body is not valid JSON."
      });
    }
    if (error.type === "entity.too.large") {
      return sendJson(res, 413, {
        error: "BODY_TOO_LARGE",
        message: "Request body exceeds the configured limit."
      });
    }
    console.error("request error:", error.message);
    sendJson(res, 500, { error: "INTERNAL_ERROR" });
  });

  return app;
}

module.exports = { createApp };
