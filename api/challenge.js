"use strict";

const { config } = require("../lib/config");
const { createChallenge } = require("../lib/challenge");
const { getStore } = require("../lib/store");
const { sendJson, methodNotAllowed } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }
  if (!config.ready) {
    return sendJson(res, 503, {
      error: "SERVER_NOT_CONFIGURED",
      message: "The verifier is missing its challenge secret or issuer configuration."
    });
  }

  const challenge = createChallenge();
  const store = getStore();

  return sendJson(res, 200, {
    token: challenge.token,
    challenge: challenge.public,
    verifier: {
      app_name: config.appName,
      app_id: config.appId,
      issuer_key_hash: config.issuerKeyHash,
      store: store.backend
    }
  });
};
