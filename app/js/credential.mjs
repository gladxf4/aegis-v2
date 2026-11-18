export const MAX_CREDENTIAL_FILE_BYTES = 512 * 1024;

const CREDENTIAL_TYPE = "aegisid.kyc.v1";
const MIN_CREDENTIAL_YEAR = 1900;

const isDecimal = (value) => typeof value === "string" && /^[0-9]{1,78}$/.test(value);

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const parsed = new Date(Date.UTC(2000, 0, 1));
  parsed.setUTCFullYear(year, month - 1, day);
  return (
    year >= MIN_CREDENTIAL_YEAR &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Checks the structure of a credential. The circuit checks its authenticity. */
export function isSignedCredential(value) {
  return Boolean(
    value?.credentialType === CREDENTIAL_TYPE &&
    isCalendarDate(value.dob) &&
    isCalendarDate(value.expires_at) &&
    isDecimal(value.uid) &&
    (value.kyc_verified === "0" || value.kyc_verified === "1") &&
    isDecimal(value.issuer?.keyHash) &&
    isDecimal(value.issuer?.publicKey?.x) &&
    isDecimal(value.issuer?.publicKey?.y) &&
    isDecimal(value.signature?.r8x) &&
    isDecimal(value.signature?.r8y) &&
    isDecimal(value.signature?.s)
  );
}

/**
 * Extracts valid credentials from an imported JSON document. Accepts one credential,
 * `{ credential }`, or `{ credentials: [] }`.
 *
 * @param {string} text
 * @param {string} batchId Makes generated credential ids unique
 * @returns {object[]}
 * @throws {Error} When the document has no usable credential
 */
export function parseCredentialDocument(text, batchId) {
  const parsed = JSON.parse(text);
  const candidates = Array.isArray(parsed?.credentials)
    ? parsed.credentials
    : [parsed?.credential ?? parsed];
  const accepted = candidates.filter(isSignedCredential);
  if (accepted.length === 0) {
    throw new Error("This file does not match the AegisID signed credential format.");
  }
  return accepted.map((credential, index) => ({
    ...credential,
    id: `import-${batchId}-${index}`,
    label: accepted.length === 1 ? "Imported credential" : `Imported credential ${index + 1}`,
    description: "Selected from this device · never uploaded",
    kind: "imported"
  }));
}

/** Maps a credential and verifier challenge onto the circuit's input signals. */
export function buildProofInput(credential, challenge, overrides = {}) {
  return {
    dob: credential.dob,
    credential_uid: credential.uid,
    kyc_verified: credential.kyc_verified,
    expires_at: credential.expires_at,
    issuer_ax: credential.issuer.publicKey.x,
    issuer_ay: credential.issuer.publicKey.y,
    signature_r8x: credential.signature.r8x,
    signature_r8y: credential.signature.r8y,
    signature_s: credential.signature.s,
    ref_date: challenge.ref_date,
    app_id: overrides.appId ?? challenge.app_id,
    nonce: overrides.nonce ?? challenge.nonce,
    issuer_key_hash: credential.issuer.keyHash
  };
}
