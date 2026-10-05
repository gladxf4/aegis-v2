# Nullifier Design and Privacy Trade-offs

## 1. Goal

The nullifier provides sybil resistance and prevents double-claiming within a single relying-party service without linking identities across different relying parties.

## 2. Derivation Formula

$$\text{nullifier} = \text{Poseidon}(\text{credential\_uid}, \text{app\_id})$$

Where:
- `credential_uid` is derived from high-entropy fields of the signed payload (e.g. SHA-256 digest of credential identifier or signature bytes).
- `app_id` is the verifier domain/app identifier.

## 3. Guarantees and Limitations

1. **Per-Credential, Per-App Scoping:**
   - For a given credential $C$ and application $A$, the nullifier is deterministic.
   - For the same credential $C$ and different application $B$, $\text{Poseidon}(C, A) \neq \text{Poseidon}(C, B)$, preventing cross-site correlation.
2. **Entropy Requirement:**
   - If `credential_uid` were derived from low-entropy fields (such as a 4-digit year of birth or postal code), an adversary could mount an offline dictionary attack to reverse the pre-image.
   - Therefore, `credential_uid` must incorporate high-entropy signed data (such as the credential UUID, photo hash, or signature entropy).
3. **Per-Credential vs. Per-Person Guarantee:**
   - AegisID guarantees uniqueness **per credential**, not per natural human. If an issuer issues a replacement credential with a distinct identifier/signature, a new nullifier will be produced. This trade-off is documented explicitly.
