"use strict";

const assert = require("node:assert/strict");
const crypto = require("crypto");
const test = require("node:test");
const { buildEddsa, buildPoseidon } = require("circomlibjs");
const { prove, signalsOf } = require("./helpers");

const REF_DATE = "20261118";
const APP_ID = "7";
const NONCE = "9";

let issueCredential;

test.before(async () => {
  const [eddsa, poseidon] = await Promise.all([buildEddsa(), buildPoseidon()]);
  const privateKey = crypto.randomBytes(32);
  const [ax, ay] = eddsa.prv2pub(privateKey);
  const publicKey = { x: eddsa.F.toString(ax), y: eddsa.F.toString(ay) };
  const keyHash = poseidon.F.toString(poseidon([BigInt(publicKey.x), BigInt(publicKey.y)]));

  issueCredential = ({ dob = "20000101", expiresAt = "20301231", uid = "123456789" }) => {
    const message = poseidon([BigInt(dob), BigInt(uid), 1n, BigInt(expiresAt)]);
    const signature = eddsa.signPoseidon(privateKey, message);
    return {
      dob,
      uid,
      kyc_verified: "1",
      expires_at: expiresAt,
      issuer: { keyHash, publicKey },
      signature: {
        r8x: eddsa.F.toString(signature.R8[0]),
        r8y: eddsa.F.toString(signature.R8[1]),
        s: signature.S.toString()
      }
    };
  };
});

function proveOn(refDate, fields, appId = APP_ID) {
  return prove(issueCredential(fields), { refDate, appId, nonce: NONCE });
}

test("a holder turning 18 today passes and one turning 18 tomorrow fails", async () => {
  await assert.doesNotReject(() => proveOn(REF_DATE, { dob: "20081118" }));
  await assert.rejects(() => proveOn(REF_DATE, { dob: "20081119" }));
});

test("the age rule holds across month and year boundaries", async () => {
  await assert.doesNotReject(() => proveOn("20270101", { dob: "20090101" }));
  await assert.rejects(() => proveOn("20270101", { dob: "20090102" }));
  await assert.doesNotReject(() => proveOn("20261201", { dob: "20081130" }));
});

test("a leap-day reference date compares correctly", async () => {
  await assert.doesNotReject(() => proveOn("20240229", { dob: "20060228" }));
  await assert.rejects(() => proveOn("20240229", { dob: "20060301" }));
});

test("a credential is valid through its expiry date and not after it", async () => {
  await assert.doesNotReject(() => proveOn(REF_DATE, { expiresAt: REF_DATE }));
  await assert.rejects(() => proveOn(REF_DATE, { expiresAt: "20261117" }));
});

test("one credential gets unlinkable nullifiers across applications", async () => {
  const first = signalsOf(await proveOn(REF_DATE, {}, "7"));
  const repeat = signalsOf(await proveOn(REF_DATE, {}, "7"));
  const other = signalsOf(await proveOn(REF_DATE, {}, "8"));
  assert.equal(first.nullifier, repeat.nullifier);
  assert.notEqual(first.nullifier, other.nullifier);
});

test("public signals reveal no private credential field", async () => {
  const credential = issueCredential({ dob: "20000101", uid: "987654321" });
  const { publicSignals } = await prove(credential, {
    refDate: REF_DATE,
    appId: APP_ID,
    nonce: NONCE
  });
  const privateValues = [
    credential.dob,
    credential.uid,
    credential.expires_at,
    credential.issuer.publicKey.x,
    credential.issuer.publicKey.y,
    credential.signature.s
  ];
  for (const value of privateValues) {
    assert.equal(publicSignals.includes(value), false);
  }
});
