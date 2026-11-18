"use strict";

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
  server.closeAllConnections();
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

async function issueProof() {
  const issued = await (await fetch(`${base}/api/challenge`)).json();
  const { proof, publicSignals } = await prove(credential("adult"), {
    refDate: issued.challenge.ref_date,
    appId: issued.challenge.app_id,
    nonce: issued.challenge.nonce
  });
  return { token: issued.token, proof, publicSignals };
}

async function submit(submission) {
  const response = await fetch(`${base}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission)
  });
  return { status: response.status, body: await response.json() };
}

function assertOneAccepted(results, expectedError) {
  const accepted = results.filter(({ status }) => status === 200);
  const rejected = results.filter(({ status }) => status === 409);
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, results.length - 1);
  assert.ok(rejected.every(({ body }) => body.error === expectedError));
}

test("simultaneous replays of one submission are accepted once", async () => {
  await fetch(`${base}/api/reset`, { method: "POST" });
  const submission = await issueProof();
  const results = await Promise.all([1, 2, 3, 4].map(() => submit(submission)));
  assertOneAccepted(results, "CHALLENGE_USED");
});

test("simultaneous proofs from one credential are accepted once", async () => {
  await fetch(`${base}/api/reset`, { method: "POST" });
  const submissions = [await issueProof(), await issueProof(), await issueProof()];
  const results = await Promise.all(submissions.map(submit));
  assertOneAccepted(results, "DUPLICATE_NULLIFIER");
});
