"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { credential, proofInput } = require("./helpers");

const load = (name) => import(`../app/js/${name}.mjs`);

test("formatters produce compact display values", async () => {
  const { formatCompactDate, formatCountdown, formatDuration, shortenMiddle } =
    await load("format");
  assert.equal(shortenMiddle("1234567890123456789", 4, 3), "1234...789");
  assert.equal(shortenMiddle("short"), "short");
  assert.equal(formatCompactDate("20261118"), "2026-11-18");
  assert.equal(formatCompactDate("soon"), "soon");
  assert.equal(formatDuration(250.4), "250 ms");
  assert.equal(formatDuration(1500), "1.5 s");
  assert.equal(formatDuration(Number.NaN), "-");
  assert.equal(formatCountdown(61_000), "1:01");
  assert.equal(formatCountdown(-5), "0:00");
});

test("browser proof input matches the circuit test input", async () => {
  const { buildProofInput } = await load("credential");
  const item = credential("adult");
  const challenge = { ref_date: "20261118", app_id: "7", nonce: "9" };
  assert.deepEqual(
    buildProofInput(item, challenge),
    proofInput(item, { refDate: "20261118", appId: "7", nonce: "9" })
  );
  const overridden = buildProofInput(item, challenge, { appId: "1", nonce: "2" });
  assert.equal(overridden.app_id, "1");
  assert.equal(overridden.nonce, "2");
});

test("credential validation rejects impossible or incomplete data", async () => {
  const { isSignedCredential } = await load("credential");
  const valid = credential("adult");
  assert.equal(isSignedCredential(valid), true);
  const invalid = [
    null,
    { ...valid, credentialType: "other" },
    { ...valid, dob: "20230230" },
    { ...valid, dob: "18991231" },
    { ...valid, expires_at: "2030" },
    { ...valid, uid: "12a" },
    { ...valid, kyc_verified: "2" },
    { ...valid, issuer: {} },
    { ...valid, signature: { ...valid.signature, s: 1 } }
  ];
  for (const candidate of invalid) {
    assert.equal(isSignedCredential(candidate), false);
  }
});

test("all supported import document shapes are parsed", async () => {
  const { parseCredentialDocument } = await load("credential");
  const item = credential("adult");
  const documents = [item, { credential: item }, { credentials: [item] }];
  for (const document of documents) {
    const [imported] = parseCredentialDocument(JSON.stringify(document), "batch");
    assert.equal(imported.id, "import-batch-0");
    assert.equal(imported.kind, "imported");
    assert.equal(imported.label, "Imported credential");
  }
  const several = parseCredentialDocument(JSON.stringify({ credentials: [item, item, {}] }), "b");
  assert.deepEqual(
    several.map(({ label }) => label),
    ["Imported credential 1", "Imported credential 2"]
  );
  assert.throws(() => parseCredentialDocument("{}", "b"), /signed credential format/);
  assert.throws(() => parseCredentialDocument("{", "b"), SyntaxError);
});

test("verifier rejections become actionable messages", async () => {
  const { describeRejection, isRetryableRejection } = await load("outcome");
  const limited = describeRejection(
    { status: 429, body: { error: "RATE_LIMITED", message: "Slow down.", retry_after_seconds: 5 } },
    "imported"
  );
  assert.deepEqual(limited, { code: "RATE_LIMITED", text: "Slow down. Try again in 5s." });
  assert.equal(isRetryableRejection("RATE_LIMITED"), true);
  assert.equal(isRetryableRejection("PROOF_INVALID"), false);

  const duplicate = { status: 409, body: { error: "DUPLICATE_NULLIFIER", message: "Used." } };
  assert.match(describeRejection(duplicate, "sample").text, /fresh sample/);
  assert.match(describeRejection(duplicate, "imported").text, /newly issued/);
  assert.equal(describeRejection({ status: 502, body: null }, "sample").code, "HTTP_502");
});

test("receipts exclude every private credential field", async () => {
  const { buildReceipt } = await load("outcome");
  const receipt = buildReceipt({
    policy: "policy",
    nullifier: "1",
    dob: "20010514",
    uid: "2",
    signature: {}
  });
  assert.equal(receipt.verified, true);
  for (const field of ["dob", "uid", "signature"]) {
    assert.equal(Object.hasOwn(receipt, field), false);
  }
});

test("test-bench scenarios are unique and judged against their expected outcome", async () => {
  const { expectsCircuitRejection, judgeResponse, SCENARIOS, tamperNullifier } =
    await load("scenarios");
  assert.equal(new Set(SCENARIOS.map(({ id }) => id)).size, SCENARIOS.length);
  for (const scenario of SCENARIOS) {
    assert.ok(credential(scenario.credential));
  }

  const find = (id) => SCENARIOS.find((scenario) => scenario.id === id);
  assert.equal(expectsCircuitRejection(find("minor")), true);
  assert.equal(expectsCircuitRejection(find("adult")), false);
  assert.equal(judgeResponse(find("adult"), { ok: true, body: { verified: true } }).passed, true);
  assert.equal(judgeResponse(find("replay"), { ok: false, body: { error: "X" } }).passed, false);
  assert.equal(
    judgeResponse(find("replay"), { ok: false, body: { error: "CHALLENGE_USED" } }).passed,
    true
  );
  assert.deepEqual(tamperNullifier(["1", "2"]), ["2", "2"]);
});
