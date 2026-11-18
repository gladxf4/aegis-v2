"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { FIELD_MODULUS } = require("../lib/config");
const { ApiError } = require("../lib/http");
const { isCanonicalFieldElement, parseProofRequest } = require("../lib/proof-request");

const proof = {
  protocol: "groth16",
  curve: "bn128",
  pi_a: ["1", "2", "1"],
  pi_b: [
    ["1", "2"],
    ["3", "4"],
    ["1", "0"]
  ],
  pi_c: ["5", "6", "1"]
};
const request = { token: "body.signature", proof, publicSignals: ["1", "2", "3", "4", "5"] };

function assertRejected(body, code) {
  assert.throws(
    () => parseProofRequest(body),
    (error) => error instanceof ApiError && error.status === 400 && error.code === code
  );
}

test("field elements must use their single canonical spelling", () => {
  assert.equal(isCanonicalFieldElement("0"), true);
  assert.equal(isCanonicalFieldElement((FIELD_MODULUS - 1n).toString()), true);
  for (const value of ["01", "00", "", "-1", "1.0", "1e3", " 1", "0x1", 1, null]) {
    assert.equal(isCanonicalFieldElement(value), false, String(value));
  }
  assert.equal(isCanonicalFieldElement(FIELD_MODULUS.toString()), false);
  assert.equal(isCanonicalFieldElement("9".repeat(78)), false);
});

test("a well-formed request is returned with named signals", () => {
  const parsed = parseProofRequest(request);
  assert.deepEqual(parsed.signals, {
    nullifier: "1",
    refDate: "2",
    appId: "3",
    nonce: "4",
    issuerHash: "5"
  });
  assert.equal(parsed.token, request.token);
});

test("non-object bodies are rejected", () => {
  for (const body of [null, [], "text", 1]) {
    assertRejected(body, "MALFORMED_BODY");
  }
});

test("missing tokens and wrong signal counts are rejected", () => {
  assertRejected({ ...request, token: 1 }, "MALFORMED_PROOF");
  assertRejected({ ...request, publicSignals: ["1"] }, "MALFORMED_PROOF");
  assertRejected({ ...request, publicSignals: "12345" }, "MALFORMED_PROOF");
});

test("numeric and padded public signals are rejected", () => {
  assertRejected({ ...request, publicSignals: [1, "2", "3", "4", "5"] }, "MALFORMED_PROOF");
  assertRejected({ ...request, publicSignals: ["01", "2", "3", "4", "5"] }, "MALFORMED_PROOF");
});

test("proofs outside the expected Groth16 structure are rejected", () => {
  const invalidProofs = [
    null,
    {},
    { ...proof, protocol: "plonk" },
    { ...proof, curve: "bls12381" },
    { ...proof, pi_a: ["1", "2"] },
    { ...proof, pi_a: [1, 2, 1] },
    { ...proof, pi_b: [["1", "2"]] },
    { ...proof, pi_b: [["1"], ["2"], ["3"]] },
    { ...proof, pi_c: ["x", "2", "1"] }
  ];
  for (const candidate of invalidProofs) {
    assertRejected({ ...request, proof: candidate }, "MALFORMED_PROOF");
  }
});
