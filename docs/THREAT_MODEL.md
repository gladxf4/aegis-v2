# Threat Model & Security Invariants

## 1. Trust Assumptions
- **Issuer Trust:** The issuer public key is known to and trusted by the verifier. The issuer does not sign false credentials.
- **Client Integrity:** The prover executes in an environment that cannot forge valid RSA signatures. Compromise of the client device may leak the local credential copy, but cannot produce valid proofs for non-qualifying credentials without the private key of an authorized issuer.

## 2. Security Invariants
- **Zero-Knowledge Privacy:** The verifier learns nothing beyond:
  1. The credential was signed by an authorized issuer.
  2. The subject's age is $\ge 18$ relative to `ref_date`.
  3. The nullifier corresponds to this specific credential under `app_id`.
- **Replay Protection:** Every proof binds a single-use random nonce issued by the verifier with a TTL $\le 300\text{s}$.
- **Cross-Domain Unlinkability:** Different relying parties (`app_id` A and `app_id` B) receive statistically independent nullifiers.
- **No PII In Transit:** Neither date of birth, name, address, photo, nor raw credential bytes are sent over the network to the verifier.
