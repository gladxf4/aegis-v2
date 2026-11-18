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
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

  const badJson = await fetch(`${base}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).error, "MALFORMED_BODY");

  const method = await request("GET", "/api/verify");
  assert.equal(method.status, 405);
});

test("reset clears the nullifier registry in demo mode", async () => {
  const response = await request("POST", "/api/reset");
  assert.equal(response.status, 200);
  assert.equal(response.body.reset, true);
});
