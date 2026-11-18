const NEXT_STEPS = {
  CHALLENGE_USED: "Refresh the request and check eligibility again.",
  CHALLENGE_EXPIRED: "Refresh the request to get a new expiry time.",
  CHALLENGE_INVALID: "Refresh the request and try again.",
  DUPLICATE_NULLIFIER:
    "This credential was already used for this app. Try a newly issued credential.",
  UNTRUSTED_ISSUER: "Use a credential issued by an issuer this verifier recognizes.",
  PROOF_INVALID: "Choose another credential or import a valid signed credential.",
  STORE_UNAVAILABLE: "The verifier could not save this result. Wait a moment and try again."
};

// These failures happen before the challenge is consumed, so the proof stays usable.
const RETRYABLE_CODES = new Set([
  "RATE_LIMITED",
  "STORE_UNAVAILABLE",
  "ISSUER_REGISTRY_UNAVAILABLE"
]);

export function isRetryableRejection(code) {
  return RETRYABLE_CODES.has(code);
}

/** Turns a rejected verifier response into a stable code and a plain explanation. */
export function describeRejection({ status, body }, credentialKind) {
  const code = body?.error ?? `HTTP_${status}`;
  if (code === "DUPLICATE_NULLIFIER" && credentialKind === "sample") {
    return { code, text: "Another visitor already used this sample. Try a fresh sample." };
  }
  const retryAfter = Number(body?.retry_after_seconds);
  const parts = [
    body?.message ?? "Proof was rejected.",
    retryAfter > 0 ? `Try again in ${retryAfter}s.` : "",
    NEXT_STEPS[code] ?? ""
  ];
  return { code, text: parts.filter(Boolean).join(" ") };
}

/** Builds the copyable receipt. It contains no credential data. */
export function buildReceipt(result) {
  return {
    type: "aegisid-verification-receipt",
    version: 1,
    verified: true,
    policy: result.policy,
    claims: result.claims,
    app_id: result.app_id,
    challenge_id: result.challenge_id,
    ref_date: result.ref_date,
    issuer_key_hash: result.issuer_key_hash,
    issuer_registry: result.issuer_registry,
    nullifier: result.nullifier,
    verify_ms: result.verify_ms,
    verified_at: result.verified_at
  };
}
