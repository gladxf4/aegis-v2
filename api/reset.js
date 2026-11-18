"use strict";

const { config, RATE_LIMITS } = require("../lib/config");
const { defineEndpoint } = require("../lib/endpoint");
const { getStore } = require("../lib/store");

/** POST /api/reset: clears this application's nullifiers in demo mode only. */
module.exports = defineEndpoint({
  methods: ["POST"],
  rateLimit: RATE_LIMITS.reset,
  requireReady: false,
  isEnabled: () => config.demoMode,
  async handle() {
    const store = getStore();
    const cleared = await store.reset(config.appId);
    return { body: { reset: true, cleared_nullifiers: cleared, store: store.backend } };
  }
});
