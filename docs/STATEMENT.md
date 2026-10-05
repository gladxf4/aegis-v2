# Zero-Knowledge Statement Specification

## 1. Objective

AegisID proves that the holder of a synthetic UIDAI-style signed identity credential satisfies `age(ref_date) >= 18` without revealing their date of birth, name, address, or full identity number.

## 2. Public and Private Signals

### Private Inputs
- `payload`: Array of bytes comprising the signed credential data (including DOB, photo hash, credential ID).
- `payload_len`: The actual byte length of the credential payload.
- `signature`: RSA-2048 signature (2048-bit integer represented as limbs).
- `dob_offset`: Starting byte offset of the DOB field within the payload.
- `uid_offset`: Starting byte offset of the unique ID / credential UID field.

### Public Inputs
- `issuer_pubkey_hash`: Poseidon hash of the issuer's RSA-2048 modulus. The verifier checks this against its trusted issuer registry.
- `ref_date`: Reference date supplied in the verifier challenge formatted as `YYYYMMDD` (as an integer or field element) or timestamp.
- `app_id`: Numerical or hash representation of the relying party domain / identifier.
- `nonce`: 128+ bit random single-use verifier challenge nonce to prevent replay attacks.

### Public Outputs
- `nullifier`: App-scoped pseudonym:
  $$\text{nullifier} = \text{Poseidon}(\text{credential\_uid}, \text{app\_id})$$

## 3. Circuit Constraints

The circuit enforces:
1. **Signature Validity:** The RSA-2048 signature verifies against the SHA-256 digest of `payload[0..payload_len]`, evaluated under the modulus corresponding to `issuer_pubkey_hash`.
2. **Predicate Evaluation:** The date of birth parsed from `payload` at `dob_offset` is validated against `ref_date`, strictly verifying that $\text{age} \ge 18$.
3. **Nullifier Derivation:** The public output `nullifier` correctly equals $\text{Poseidon}(\text{credential\_uid}, \text{app\_id})$.
4. **Binding:** `app_id` and `nonce` are constrained public signals in the Groth16 proof, binding the proof to the session and verifier domain.
