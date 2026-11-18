"use strict";

const { RATE_LIMITS } = require("../lib/config");
const { defineEndpoint } = require("../lib/endpoint");
const { verifySubmission } = require("../lib/verification");

/** POST /api/verify: checks a proof and records its challenge and nullifier. */
module.exports = defineEndpoint({
  methods: ["POST"],
  rateLimit: RATE_LIMITS.verify,
  errorFields: { verified: false },
  handle: async (req) => ({ body: await verifySubmission(req) })
});
