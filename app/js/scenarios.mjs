const PROOF_REJECTED = "proof-rejected";
const VERIFIED = "verified";

function rejectedByCircuit(id, name, note) {
  return { id, name, note, expected: PROOF_REJECTED, label: "Proof rejected", credential: id };
}

function rejectedWith(code, fields) {
  return { credential: "adult", ...fields, expected: code, label: code };
}

export const SCENARIOS = [
  {
    id: "adult",
    name: "KYC complete + 18+",
    note: "Trusted issuer attests KYC completion; holder also meets 18+ rule.",
    expected: VERIFIED,
    label: "Verified",
    credential: "adult"
  },
  rejectedByCircuit(
    "unverified-kyc",
    "KYC incomplete",
    "A valid issuer signature cannot turn an incomplete KYC claim into a pass."
  ),
  rejectedByCircuit(
    "expired",
    "Expired credential",
    "A KYC credential past its signed expiry date must fail."
  ),
  rejectedByCircuit("minor", "Underage credential", "Signature valid, date of birth too recent."),
  rejectedByCircuit(
    "altered",
    "Altered signature",
    "Signature changed after the credential was issued."
  ),
  rejectedWith("UNTRUSTED_ISSUER", {
    id: "untrusted",
    name: "Unrecognized issuer",
    note: "Valid signature under a key the verifier does not trust.",
    credential: "untrusted"
  }),
  rejectedWith("APP_MISMATCH", {
    id: "wrong-app",
    name: "Wrong application",
    note: "Proof generated for a different application id.",
    overrides: { appId: "1" }
  }),
  rejectedWith("NONCE_MISMATCH", {
    id: "wrong-nonce",
    name: "Wrong nonce",
    note: "Proof generated for a different challenge nonce.",
    overrides: { nonce: "1" }
  }),
  rejectedWith("CHALLENGE_USED", {
    id: "replay",
    name: "Replay",
    note: "Same proof and token submitted twice.",
    replay: true
  }),
  rejectedWith("PROOF_INVALID", {
    id: "tampered-signal",
    name: "Tampered public signal",
    note: "Nullifier changed after proof generation.",
    tamperNullifier: true
  })
];

export function expectsCircuitRejection(scenario) {
  return scenario.expected === PROOF_REJECTED;
}

/** Compares a verifier response with the outcome a scenario expects. */
export function judgeResponse(scenario, { ok, body }) {
  const actual = ok && body?.verified ? VERIFIED : (body?.error ?? "no response");
  return actual === scenario.expected
    ? { passed: true, text: `Pass (${actual})` }
    : { passed: false, text: `Expected ${scenario.label}, got ${actual}` };
}

/** Changes the first public signal while keeping it a valid field element. */
export function tamperNullifier(publicSignals) {
  const [nullifier, ...rest] = publicSignals;
  return [(BigInt(nullifier) + 1n).toString(), ...rest];
}
