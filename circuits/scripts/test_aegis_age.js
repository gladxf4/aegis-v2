const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=== Testing Aegis Age Circuit ===");
  const poseidon = await buildPoseidon();

  // Helper to convert Uint8Array / BigInt to Circom-compatible string
  const F = poseidon.F;
  const hash2 = (a, b) => F.toString(poseidon([BigInt(a), BigInt(b)]));

  const BUILD_DIR = path.join(__dirname, "../build");
  const wasmPath = path.join(BUILD_DIR, "aegis_age_js/aegis_age.wasm");
  const zkeyPath = path.join(BUILD_DIR, "aegis_age_final.zkey");
  const vkey = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, "aegis_age_verification_key.json"), "utf8"));

  // 1. Setup Issuer test keys & credential
  const issuer_pubkey_hash = hash2("12345678901234567890", "98765432109876543210");
  const ref_date = "20261006"; // October 6, 2026
  const app_id = hash2("1001", "2002");
  const nonce = "98234710293847109283471";

  // Test Case 1: Alice (DOB: 2001-05-14 -> Age ~25 >= 18)
  console.log("\n[Test 1] Adult (Alice, DOB 20010514): Expected PASS");
  const alice_dob = "20010514";
  const alice_uid = hash2("9999888877776666", "1111222233334444");
  const alice_sig = hash2("4444555566667777", "8888999900001111");
  const alice_bind = hash2(alice_uid, alice_sig);

  const aliceInput = {
    dob: alice_dob,
    credential_uid: alice_uid,
    signature_hash: alice_sig,
    issuer_secret_bind: alice_bind,
    ref_date: ref_date,
    app_id: app_id,
    nonce: nonce,
    issuer_pubkey_hash: issuer_pubkey_hash
  };

  const { proof: aliceProof, publicSignals: alicePub } = await snarkjs.groth16.fullProve(
    aliceInput,
    wasmPath,
    zkeyPath
  );

  console.log("-> Proof generated successfully!");
  console.log("-> Public Signals (nullifier, ref_date, app_id, nonce, issuer_pubkey_hash):");
  console.log(alicePub);

  const aliceVerified = await snarkjs.groth16.verify(vkey, alicePub, aliceProof);
  console.log("-> Verification Result:", aliceVerified ? "VALID (PASS)" : "INVALID (FAIL)");
  if (!aliceVerified) throw new Error("Alice verification failed!");

  // Test Case 2: Bob (DOB: 2010-08-20 -> Age 16 < 18)
  console.log("\n[Test 2] Underage (Bob, DOB 20100820): Expected REJECT (Circuit constraint)");
  const bob_dob = "20100820";
  const bob_uid = hash2("1111000011110000", "2222333344445555");
  const bob_sig = hash2("3333222211110000", "7777888899990000");
  const bob_bind = hash2(bob_uid, bob_sig);

  const bobInput = {
    dob: bob_dob,
    credential_uid: bob_uid,
    signature_hash: bob_sig,
    issuer_secret_bind: bob_bind,
    ref_date: ref_date,
    app_id: app_id,
    nonce: nonce,
    issuer_pubkey_hash: issuer_pubkey_hash
  };

  try {
    await snarkjs.groth16.fullProve(bobInput, wasmPath, zkeyPath);
    console.error("FAIL: Bob should have failed constraint check!");
    process.exit(1);
  } catch (err) {
    console.log("-> SUCCESS: Prover correctly rejected underage witness (Assert Failed)");
  }

  // Test Case 3: Replay / Wrong Nonce
  console.log("\n[Test 3] Tampered Nonce on Verifier: Expected REJECT");
  const tamperedPub = [...alicePub];
  tamperedPub[3] = "99999999999999999999999"; // Altered nonce
  const tamperedVerified = await snarkjs.groth16.verify(vkey, tamperedPub, aliceProof);
  console.log("-> Tampered Nonce Verification Result:", tamperedVerified ? "FAIL" : "REJECTED (PASS)");
  if (tamperedVerified) throw new Error("Tampered nonce accepted!");

  console.log("\n=== All Circuit Integration Tests PASSED ===");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
