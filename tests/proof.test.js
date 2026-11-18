"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const snarkjs = require("snarkjs");
const { config } = require("../lib/config");
const { credential, verificationKey, proofInput, prove, signalsOf } = require("./helpers");

const context = {
  refDate: "20261118",
  appId: config.appId,
  nonce: "123456789012345678901234567890"
};

test("adult credential produces a proof the verifier accepts", async () => {
  const adult = credential("adult");
  const { proof, publicSignals } = await prove(adult, context);

  assert.equal(publicSignals.length, 5);
  assert.equal(await snarkjs.groth16.verify(verificationKey, publicSignals, proof), true);

  const signals = signalsOf({ publicSignals });
  assert.equal(signals.refDate, context.refDate);
  assert.equal(signals.appId, context.appId);
  assert.equal(signals.nonce, context.nonce);
  assert.equal(signals.issuerHash, adult.issuer.keyHash);
});

test("underage credential does not produce a witness", async () => {
  const minor = credential("minor");
  await assert.rejects(() => prove(minor, context));
});

test("credential without completed KYC does not produce a witness", async () => {
  const incomplete = credential("unverified-kyc");
  await assert.rejects(() => prove(incomplete, context));
});

test("expired credential does not produce a witness", async () => {
  const expired = credential("expired");
  await assert.rejects(() => prove(expired, context));
});

test("altered signature does not produce a witness", async () => {
  const altered = credential("altered");
  await assert.rejects(() => prove(altered, context));
});

test("an unrecognized issuer produces a proof with a different key hash", async () => {
  const untrusted = credential("untrusted");
  const { proof, publicSignals } = await prove(untrusted, context);

  assert.equal(await snarkjs.groth16.verify(verificationKey, publicSignals, proof), true);
  assert.notEqual(signalsOf({ publicSignals }).issuerHash, config.issuerKeyHash);
});

test("the nullifier changes with the application id", async () => {
  const adult = credential("adult");
  const first = await prove(adult, context);
  const second = await prove(adult, { ...context, appId: "1" });

  assert.notEqual(signalsOf(first).nullifier, signalsOf(second).nullifier);
});

test("proof input remains a pure function of the credential and challenge", () => {
  const adult = credential("adult");
  const input = proofInput(adult, context);
  assert.deepEqual(input, proofInput(adult, context));
  assert.equal(input.dob, adult.dob);
  assert.equal(input.credential_uid, adult.uid);
});
