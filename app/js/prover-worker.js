/* global importScripts, snarkjs */
"use strict";

// Proving is CPU-heavy, so it runs here to keep the page responsive and to keep
// assistive technology able to announce progress.
importScripts("/vendor/snarkjs.min.js");

const WASM_URL = "/artifacts/age_proof.wasm";
const ZKEY_URL = "/artifacts/age_proof_final.zkey";
const CONSTRAINT_FAILURE = /assert failed|error in template/i;

self.onmessage = async ({ data }) => {
  try {
    const result = await snarkjs.groth16.fullProve(data.input, WASM_URL, ZKEY_URL);
    self.postMessage({ ok: true, result });
  } catch (error) {
    const message = String(error?.message ?? error);
    self.postMessage({ ok: false, rejected: CONSTRAINT_FAILURE.test(message), message });
  }
};
