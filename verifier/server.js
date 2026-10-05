const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../demo-site/public")));

// Paths to circuit artifacts
const BUILD_DIR = path.join(__dirname, "../circuits/build");
const vkeyPath = path.join(BUILD_DIR, "aegis_age_verification_key.json");
const wasmPath = path.join(BUILD_DIR, "aegis_age_js/aegis_age.wasm");
const zkeyPath = path.join(BUILD_DIR, "aegis_age_final.zkey");

let vkey = null;
let poseidon = null;
let F = null;

// Initialize crypto primitives
async function initCrypto() {
  if (fs.existsSync(vkeyPath)) {
    vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  }
  poseidon = await buildPoseidon();
  F = poseidon.F;
  console.log("-> Poseidon & Groth16 verification key initialized.");
}

const hash2 = (a, b) => F.toString(poseidon([BigInt(a), BigInt(b)]));

// In-memory state for Relying Party (Aegis Gate)
const VERIFIER_APP_ID = "42069";
const TRUSTED_ISSUER_PUBKEY_HASH = "7161766445121458542277554316254167206856242567226589749111575213675392504366";

// Challenge store: challenge_id -> { nonce, app_id, ref_date, expires_at, status, result }
const activeChallenges = new Map();

// Nullifier store: app_id:nullifier -> { timestamp, challenge_id }
const registeredNullifiers = new Map();

// Pre-defined synthetic personas for hackathon demonstration
function getPersonas() {
  const alice_uid = hash2("9999888877776666", "1111222233334444");
  const alice_sig = hash2("4444555566667777", "8888999900001111");
  const alice_bind = hash2(alice_uid, alice_sig);

  const bob_uid = hash2("1111000011110000", "2222333344445555");
  const bob_sig = hash2("3333222211110000", "7777888899990000");
  const bob_bind = hash2(bob_uid, bob_sig);

  const eve_uid = hash2("5555666677778888", "9999000011112222");
  const eve_sig = hash2("1212121212121212", "3434343434343434"); // Tampered signature
  const eve_bind = "123456789012345678901234567890"; // Invalid binding

  return [
    {
      id: "alice",
      name: "Alice Sharma",
      badge: "Adult (Eligible)",
      badgeType: "success",
      dob: "2001-05-14",
      dobInt: "20010514",
      age: 25,
      gender: "F",
      maskedAadhaar: "XXXX-XXXX-3092",
      state: "Maharashtra",
      credential_uid: alice_uid,
      signature_hash: alice_sig,
      issuer_secret_bind: alice_bind,
      issuer_pubkey_hash: TRUSTED_ISSUER_PUBKEY_HASH,
      expectedResult: "PASS"
    },
    {
      id: "bob",
      name: "Bob Verma",
      badge: "Minor (Underage)",
      badgeType: "danger",
      dob: "2010-08-20",
      dobInt: "20100820",
      age: 16,
      gender: "M",
      maskedAadhaar: "XXXX-XXXX-5501",
      state: "Karnataka",
      credential_uid: bob_uid,
      signature_hash: bob_sig,
      issuer_secret_bind: bob_bind,
      issuer_pubkey_hash: TRUSTED_ISSUER_PUBKEY_HASH,
      expectedResult: "CIRCUIT_FAIL"
    },
    {
      id: "eve",
      name: "Eve Gupta",
      badge: "Tampered Signature",
      badgeType: "warning",
      dob: "1998-11-03",
      dobInt: "19981103",
      age: 27,
      gender: "F",
      maskedAadhaar: "XXXX-XXXX-9944",
      state: "Delhi",
      credential_uid: eve_uid,
      signature_hash: eve_sig,
      issuer_secret_bind: eve_bind,
      issuer_pubkey_hash: TRUSTED_ISSUER_PUBKEY_HASH,
      expectedResult: "SIGNATURE_FAIL"
    }
  ];
}

// 1. Issue a single-use Challenge
app.get("/api/challenge", async (req, res) => {
  const challengeId = crypto.randomUUID();
  // Generate 128-bit random nonce as BigInt string
  const nonceBuffer = crypto.randomBytes(16);
  const nonce = BigInt("0x" + nonceBuffer.toString("hex")).toString();

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const refDate = `${year}${month}${day}`;

  const challengeData = {
    challenge_id: challengeId,
    nonce: nonce,
    app_id: VERIFIER_APP_ID,
    ref_date: refDate,
    expires_at: Date.now() + 5 * 60 * 1000, // 5 min TTL
    status: "PENDING",
    result: null
  };

  activeChallenges.set(challengeId, challengeData);

  // Generate QR code data URL
  const qrPayload = JSON.stringify({
    aegis: "v1",
    cid: challengeId,
    nonce: nonce,
    app_id: VERIFIER_APP_ID,
    ref_date: refDate,
    server: `http://localhost:${PORT}`
  });

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 280,
    margin: 1,
    color: {
      dark: "#00f0ff",
      light: "#0b0f19"
    }
  });

  res.json({
    ...challengeData,
    qr_data_url: qrDataUrl
  });
});

// 2. Poll Challenge Status
app.get("/api/challenge/:id", (req, res) => {
  const challenge = activeChallenges.get(req.params.id);
  if (!challenge) {
    return res.status(404).json({ error: "Challenge not found" });
  }
  res.json(challenge);
});

// 3. Get Personas for Wallet / Demo
app.get("/api/personas", (req, res) => {
  res.json(getPersonas());
});

// 4. Generate Proof (Prover API - used by Wallet simulator)
app.post("/api/prover/prove", async (req, res) => {
  const startTime = Date.now();
  const { personaId, challengeId } = req.body;

  const challenge = activeChallenges.get(challengeId);
  if (!challenge) {
    return res.status(400).json({ error: "Invalid or expired challenge ID" });
  }

  const persona = getPersonas().find(p => p.id === personaId);
  if (!persona) {
    return res.status(404).json({ error: "Persona not found" });
  }

  const circuitInput = {
    dob: persona.dobInt,
    credential_uid: persona.credential_uid,
    signature_hash: persona.signature_hash,
    issuer_secret_bind: persona.issuer_secret_bind,
    ref_date: challenge.ref_date,
    app_id: challenge.app_id,
    nonce: challenge.nonce,
    issuer_pubkey_hash: persona.issuer_pubkey_hash
  };

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput,
      wasmPath,
      zkeyPath
    );

    const proverLatencyMs = Date.now() - startTime;

    res.json({
      success: true,
      proof,
      publicSignals,
      proverLatencyMs,
      persona: {
        name: persona.name,
        age: persona.age
      }
    });
  } catch (err) {
    console.error("Prover error:", err.message);
    res.status(422).json({
      success: false,
      error: "Proof generation rejected by zero-knowledge circuit constraints.",
      details: err.message.includes("Assert Failed") || err.message.includes("Error in template")
        ? "Circuit Assertion Failed: Subject does not satisfy age >= 18 or credential signature is invalid."
        : err.message
    });
  }
});

// 5. Verify Proof (Relying Party Verifier Endpoint)
app.post("/api/verify", async (req, res) => {
  const verifyStart = Date.now();
  const { challenge_id, proof, publicSignals } = req.body;

  const challenge = activeChallenges.get(challenge_id);
  if (!challenge) {
    return res.status(400).json({
      verified: false,
      reason: "Challenge not found or session expired."
    });
  }

  if (challenge.status === "VERIFIED") {
    return res.status(409).json({
      verified: false,
      reason: "Replay attack detected: Challenge nonce has already been consumed."
    });
  }

  if (Date.now() > challenge.expires_at) {
    return res.status(400).json({
      verified: false,
      reason: "Challenge expired (5 minute TTL exceeded)."
    });
  }

  if (!proof || !publicSignals || publicSignals.length < 5) {
    return res.status(400).json({
      verified: false,
      reason: "Malformed proof or missing public signals."
    });
  }

  // Extract public signals: [nullifier, ref_date, app_id, nonce, issuer_pubkey_hash]
  const [nullifier, pubRefDate, pubAppId, pubNonce, pubIssuerHash] = publicSignals;

  // 1. Enforce Nonce Match
  if (pubNonce !== challenge.nonce) {
    return res.status(400).json({
      verified: false,
      reason: "Nonce mismatch: Proof was not generated for this verifier session."
    });
  }

  // 2. Enforce App ID Match
  if (pubAppId !== challenge.app_id) {
    return res.status(400).json({
      verified: false,
      reason: "App ID mismatch: Proof was targeted to a different relying party."
    });
  }

  // 3. Enforce Trusted Issuer
  if (pubIssuerHash !== TRUSTED_ISSUER_PUBKEY_HASH) {
    return res.status(400).json({
      verified: false,
      reason: "Untrusted issuer public key hash."
    });
  }

  // 4. Sybil & Double-Claim Nullifier Check
  const nullifierKey = `${pubAppId}:${nullifier}`;
  if (registeredNullifiers.has(nullifierKey)) {
    challenge.status = "REJECTED";
    challenge.result = {
      verified: false,
      reason: "Duplicate claim detected: This credential has already been verified for this application.",
      nullifier: nullifier
    };
    return res.status(409).json(challenge.result);
  }

  // 5. Cryptographic Groth16 Verification
  try {
    const isGroth16Valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    const verifyLatencyMs = Date.now() - verifyStart;

    if (!isGroth16Valid) {
      challenge.status = "REJECTED";
      challenge.result = {
        verified: false,
        reason: "Cryptographic proof verification failed."
      };
      return res.status(400).json(challenge.result);
    }

    // Success! Record nullifier and mark challenge as verified
    registeredNullifiers.set(nullifierKey, {
      timestamp: Date.now(),
      challenge_id
    });

    challenge.status = "VERIFIED";
    challenge.result = {
      verified: true,
      nullifier: nullifier,
      verifyLatencyMs: verifyLatencyMs,
      proofProtocol: "Groth16 / BN128",
      proofSize: JSON.stringify(proof).length + " bytes",
      piiRevealed: "0 bytes (DOB, Name, Aadhaar hidden)"
    };

    res.json(challenge.result);
  } catch (err) {
    challenge.status = "REJECTED";
    challenge.result = {
      verified: false,
      reason: "Verification error: " + err.message
    };
    res.status(500).json(challenge.result);
  }
});

// 6. Reset Nullifiers (for live hackathon demo convenience)
app.post("/api/reset-nullifiers", (req, res) => {
  registeredNullifiers.clear();
  res.json({ success: true, message: "Nullifier registry reset." });
});

// Start server
initCrypto().then(() => {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🛡️  AegisID Demo Server running on: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}).catch(err => {
  console.error("Failed to start AegisID server:", err);
});
