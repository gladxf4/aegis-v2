"use strict";

process.env.CHALLENGE_SECRET = "api-test-secret";
process.env.AEGIS_DEMO = "1";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../server/app");
const { credential, prove } = require("./helpers");

let server;
let base;

test.before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  server.on("connection", (socket) => {
    socket.setMaxListeners(30);
  });
  await new Promise((resolve) => {
    server.once("listening", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Connection: "close",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function challenge() {
  const response = await request("GET", "/api/challenge");
  assert.equal(response.status, 200);
  return response.body;
}

function proofFor(item, issued, overrides = {}) {
  return prove(item, {
    refDate: issued.challenge.ref_date,
    appId: overrides.appId || issued.challenge.app_id,
    nonce: overrides.nonce || issued.challenge.nonce
  });
}

test("health reports a ready memory-backed verifier", async () => {
  const response = await request("GET", "/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.store, "memory");
  assert.equal(response.body.demo_mode, true);
});

test("a valid proof is accepted once and the token cannot be replayed", async () => {
  await request("POST", "/api/reset");
  const issued = await challenge();
  const proof = await proofFor(credential("adult"), issued);

  const first = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: proof.publicSignals
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.verified, true);
  assert.match(first.body.nullifier, /^\d+$/);
  assert.deepEqual(first.body.claims, { kyc_verified: true, age_over_18: true });
  assert.equal(first.body.policy, "AegisID-KYC-Age-v1");
  assert.doesNotThrow(() => new Date(first.body.verified_at).toISOString());
  assert.equal(Object.hasOwn(first.body, "valid_until"), false);

  const replay = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: proof.publicSignals
  });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error, "CHALLENGE_USED");
});

test("the same credential cannot be verified twice for one application", async () => {
  const issued = await challenge();
  const proof = await proofFor(credential("adult"), issued);

  const response = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: proof.publicSignals
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "DUPLICATE_NULLIFIER");
});

test("a proof for another application is rejected before verification", async () => {
  await request("POST", "/api/reset");
  const issued = await challenge();
  const proof = await proofFor(credential("adult"), issued, { appId: "1" });

  const response = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: proof.publicSignals
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "APP_MISMATCH");
});

test("a proof bound to another nonce is rejected", async () => {
  const issued = await challenge();
  const proof = await proofFor(credential("adult"), issued, { nonce: "1" });

  const response = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: proof.publicSignals
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "NONCE_MISMATCH");
});

test("an untrusted issuer is rejected even when the proof is valid", async () => {
  const issued = await challenge();
  const proof = await proofFor(credential("untrusted"), issued);

  const response = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: proof.publicSignals
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "UNTRUSTED_ISSUER");
});

test("malformed verification requests fail closed", async () => {
  const noBody = await request("POST", "/api/verify", {});
  assert.equal(noBody.status, 400);
  assert.equal(noBody.body.error, "MALFORMED_PROOF");

  const shortSignals = await request("POST", "/api/verify", {
    token: "x.y",
    proof: {},
    publicSignals: []
  });
  assert.equal(shortSignals.status, 400);

  const issued = await challenge();
  const invalidFieldSignal = await request("POST", "/api/verify", {
    token: issued.token,
    proof: {},
    publicSignals: ["not-a-number", "20261118", "1", "1", "1"]
  });
  assert.equal(invalidFieldSignal.status, 400);
  assert.equal(invalidFieldSignal.body.error, "MALFORMED_PROOF");

  const badJson = await fetch(`${base}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Connection: "close" },
    body: "{"
  });
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).error, "MALFORMED_BODY");

  const method = await request("GET", "/api/verify");
  assert.equal(method.status, 405);
});

test("a zero-padded nullifier cannot bypass the duplicate check", async () => {
  await request("POST", "/api/reset");
  const item = credential("adult");
  const firstChallenge = await challenge();
  const firstProof = await proofFor(item, firstChallenge);
  const accepted = await request("POST", "/api/verify", {
    token: firstChallenge.token,
    proof: firstProof.proof,
    publicSignals: firstProof.publicSignals
  });
  assert.equal(accepted.status, 200);

  const issued = await challenge();
  const proof = await proofFor(item, issued);
  const [nullifier, ...rest] = proof.publicSignals;
  const response = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: [`0${nullifier}`, ...rest]
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "MALFORMED_PROOF");
  assert.equal(response.body.verified, false);
});

test("a rejected proof does not consume its challenge", async () => {
  await request("POST", "/api/reset");
  const issued = await challenge();
  const proof = await proofFor(credential("adult"), issued);
  const tampered = {
    token: issued.token,
    proof: proof.proof,
    publicSignals: [
      (BigInt(proof.publicSignals[0]) + 1n).toString(),
      ...proof.publicSignals.slice(1)
    ]
  };
  assert.equal((await request("POST", "/api/verify", tampered)).body.error, "PROOF_INVALID");

  const genuine = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: proof.publicSignals
  });
  assert.equal(genuine.status, 200);
});

test("responses carry the shared security headers", async () => {
  const response = await fetch(`${base}/`, { headers: { Connection: "close" } });
  await response.arrayBuffer();
  assert.match(response.headers.get("content-security-policy"), /style-src 'self';/);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("a proof with reference date mismatch is rejected", async () => {
  const issued = await challenge();
  const proof = await proofFor(credential("adult"), issued);

  const tamperedSignals = [...proof.publicSignals];
  tamperedSignals[1] = "20250101"; // change refDate

  const response = await request("POST", "/api/verify", {
    token: issued.token,
    proof: proof.proof,
    publicSignals: tamperedSignals
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "REF_DATE_MISMATCH");
});

test("reset clears the nullifier registry in demo mode", async () => {
  const response = await request("POST", "/api/reset");
  assert.equal(response.status, 200);
  assert.equal(response.body.reset, true);

  const getMethod = await request("GET", "/api/reset");
  assert.equal(getMethod.status, 405);
});

test("endpoints enforce allowed HTTP methods and report 405", async () => {
  const challengePost = await request("POST", "/api/challenge", {});
  assert.equal(challengePost.status, 405);
  assert.equal(challengePost.body.error, "METHOD_NOT_ALLOWED");

  const healthPost = await request("POST", "/api/health", {});
  assert.equal(healthPost.status, 405);
  assert.equal(healthPost.body.error, "METHOD_NOT_ALLOWED");

  const notFound = await request("GET", "/api/nonexistent-endpoint");
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error, "NOT_FOUND");
});

test("non-object JSON body to verify returns 400 MALFORMED_BODY", async () => {
  const arrayBody = await request("POST", "/api/verify", [1, 2, 3]);
  assert.equal(arrayBody.status, 400);
  assert.equal(arrayBody.body.error, "MALFORMED_BODY");
});

test("oversized verification payload returns 413", async () => {
  const hugePayload = {
    token: "x.y",
    proof: { padding: "a".repeat(260 * 1024) },
    publicSignals: ["1", "20261118", "1", "1", "1"]
  };
  const res = await request("POST", "/api/verify", hugePayload);
  assert.equal(res.status, 413);
  assert.ok(res.body.error === "PROOF_TOO_LARGE" || res.body.error === "BODY_TOO_LARGE");
});

test("corrupted groth16 proof fails with PROOF_INVALID", async () => {
  const issued = await challenge();
  const validProof = await proofFor(credential("adult"), issued);
  const tamperedProof = {
    ...validProof.proof,
    pi_a: ["12345", "67890", "1"]
  };
  const response = await request("POST", "/api/verify", {
    token: issued.token,
    proof: tamperedProof,
    publicSignals: validProof.publicSignals
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "PROOF_INVALID");
});

test("health endpoint supports HEAD method", async () => {
  const headRes = await fetch(`${base}/api/health`, {
    method: "HEAD",
    headers: { Connection: "close" }
  });
  assert.equal(headRes.status, 200);
  assert.equal(headRes.headers.get("content-type"), "application/json; charset=utf-8");
  const text = await headRes.text();
  assert.equal(text, "");
});
