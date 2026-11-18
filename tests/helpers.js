"use strict";

if (process.stdout?.setMaxListeners) {
  process.stdout.setMaxListeners(50);
}
if (process.stderr?.setMaxListeners) {
  process.stderr.setMaxListeners(50);
}

const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");

const root = path.join(__dirname, "..");
const artifacts = path.join(root, "app", "artifacts");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "app", "credentials.json"), "utf8"));
const verificationKey = JSON.parse(
  fs.readFileSync(path.join(root, "circuits", "build", "age_proof_verification_key.json"), "utf8")
);

const wasm = path.join(artifacts, "age_proof.wasm");
const zkey = path.join(artifacts, "age_proof_final.zkey");

function credential(id) {
  const found = fixtures.credentials.find((item) => item.id === id);
  if (!found) {
    throw new Error(`unknown credential fixture: ${id}`);
  }
  return found;
}

function proofInput(item, context) {
  return {
    dob: item.dob,
    credential_uid: item.uid,
    kyc_verified: item.kyc_verified,
    expires_at: item.expires_at,
    issuer_ax: item.issuer.publicKey.x,
    issuer_ay: item.issuer.publicKey.y,
    signature_r8x: item.signature.r8x,
    signature_r8y: item.signature.r8y,
    signature_s: item.signature.s,
    ref_date: context.refDate,
    app_id: context.appId,
    nonce: context.nonce,
    issuer_key_hash: item.issuer.keyHash
  };
}

async function prove(item, context) {
  return snarkjs.groth16.fullProve(proofInput(item, context), wasm, zkey);
}

function signalsOf(result) {
  const [nullifier, refDate, appId, nonce, issuerHash] = result.publicSignals.map(String);
  return { nullifier, refDate, appId, nonce, issuerHash };
}

module.exports = {
  root,
  fixtures,
  verificationKey,
  credential,
  proofInput,
  prove,
  signalsOf
};
