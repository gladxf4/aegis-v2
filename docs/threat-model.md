# Threat model

## Scope

This document covers the code in this repository: the circuit, issuer fixtures, browser
prover, API functions, local server, and state store. It does not cover a real
government issuer, a production identity database, or a mobile operating system.

## Assets

| Asset                 | Where it lives                      |
| --------------------- | ----------------------------------- |
| Date of birth         | Browser and credential fixture      |
| Credential UID        | Browser and credential fixture      |
| Issuer signature      | Browser and credential fixture      |
| Issuer private key    | `issuer/keypair.json`, local only   |
| Trusted issuer hash   | EVM registry or local demo config   |
| Challenge HMAC secret | Environment variable                |
| Challenge state       | Memory or Redis                     |
| Nullifier registry    | Memory or Redis                     |
| Rate-limit counters   | Memory or Redis; one-minute windows |

## Adversaries

1. **Malicious prover.** Holds a credential and tries to prove a false age, reuse a
   credential, or forge an issuer.
2. **Replaying client.** Captures a token and proof and submits them again.
3. **Untrusted issuer.** Signs an age claim with a key the verifier does not trust.
4. **Network attacker.** Reads or modifies requests between browser and server.
5. **Compromised verifier.** Has the server secret or state store.
6. **Operator error.** Misconfigures the app id, issuer hash, or store.

## Guarantees

For a verifier that pins the correct issuer hash and keeps its secret:

- A proof cannot be accepted unless the credential signature verifies under the
  trusted issuer key.
- A proof cannot be accepted unless the issuer-signed KYC status is complete and the
  credential is unexpired for the reference date.
- A proof cannot be accepted unless the date of birth satisfies the age predicate for
  the reference date in the challenge.
- A proof cannot be accepted for a different application id, reference date, or
  nonce.
- A challenge token cannot be modified without the HMAC secret.
- A token cannot be reused after successful verification.
- A credential cannot be verified twice for one application when the nullifier store
  is working and shared.

## Attacks and controls

| Attack                     | Control                                                                              | Residual risk                                                          |
| -------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Forge a signature          | EdDSA-Poseidon verification in-circuit                                               | A break in BabyJubjub or Poseidon                                      |
| Swap in another issuer key | `issuer_key_hash` constraint and server pin                                          | Operator pins the wrong hash                                           |
| Misconfigure registry RPC  | Chain id check, nonzero hash requirement, short request timeout                      | RPC provider or registry owner can still withhold or change trust      |
| Claim an underage DOB      | Age constraint in-circuit                                                            | Date encoding edge cases                                               |
| Replay a proof             | Nonce binding, token expiry, challenge consume                                       | Token stolen before use                                                |
| Reuse a credential         | Nullifier registry                                                                   | Memory store loses state on restart                                    |
| Modify public signals      | Groth16 verification and server comparisons                                          | None known in the protocol                                             |
| Tamper with the token      | HMAC-SHA256, constant-time compare                                                   | Secret disclosure                                                      |
| Cross-app replay           | App id in token and nullifier                                                        | Same app name reused by mistake                                        |
| Forge proofs               | Groth16 soundness                                                                    | Toxic waste from the development setup                                 |
| Read PII from requests     | Browser-only private inputs                                                          | Browser or extension compromise                                        |
| Repeated endpoint use      | 30 samples, 60 challenges, and 20 proofs/minute per address; HMAC-derived Redis keys | Distributed sources and edge-level floods still need platform controls |

## Trusted setup

The Groth16 key was produced by a single-party development setup. If the entropy used
during setup is recoverable, an attacker can create proofs for false statements
without a credential. This is the largest cryptographic assumption in the build. A
production deployment needs a public multi-party ceremony and a published transcript.

## Demo issuer

`issuer/keypair.json` is a local development key. Anyone with that file can issue
credentials that the demo verifier accepts. The file is gitignored, but it exists on
the development machine. Rotate it with `node issuer/init.js --rotate` if it may have
leaked.

The signed credentials in `app/credentials.json` are public acceptance fixtures.
`config/demo-samples.json` contains 1,024 additional pre-signed synthetic adult samples
for the public demo endpoint. Each sample has a unique UID and can pass the persistent
nullifier check once per application. The pool is finite, and none of its entries
represents a real person or identity document.

## Challenge secret

`CHALLENGE_SECRET` authenticates challenge tokens. If it leaks, an attacker can mint
tokens with arbitrary nonces and application ids. They still cannot forge a proof for
a false statement, but they can bypass token expiry and application binding until the
secret is rotated.

Use at least 32 random bytes. Rotating the secret invalidates outstanding tokens. It
does not invalidate nullifiers.

## State store

The memory store is per process. On Vercel, separate function instances do not share
it, so replay and duplicate detection can fail across instances. Production refuses
readiness without shared Redis. If Redis is partially configured or unavailable,
challenge and proof requests fail closed with `STORE_UNAVAILABLE`.

Rate-limit keys are HMACs over the app id, endpoint, and client address. Redis stores
only the derived key and an expiring counter, not the address itself. The window is one
minute. Local development uses process memory, so its limit is not shared across
instances. The limits slow repeated requests from one address; they do not stop
distributed denial of service or replace Vercel Firewall controls.

Redis is trusted for availability and integrity. A compromised Redis can drop
nullifiers, replay challenges, or mount a denial of service. Protect the token and use
TLS.

## Application id

`APP_ID` is hashed into a field element. Two deployments with the same name share a
nullifier namespace if they also share a store. Use distinct names per environment,
or separate stores.

## Clock and expiry

Challenge validity depends on the server clock. A large clock skew can reject valid
tokens or extend their lifetime. The verifier allows 60 seconds of future issue time.
Keep hosts time-synchronised.

## Browser

The browser is trusted to run the prover faithfully. A compromised browser, malicious
extension, or modified page can exfiltrate the credential or lie about the result
shown to the user. The server still verifies the proof, but it cannot protect the
credential on the client.

The page has no user-generated HTML and no third-party scripts beyond the bundled
snarkjs file. The Vercel deployment sets a Content-Security-Policy that restricts
scripts and connections to the same origin and allows WebAssembly compilation for the
local prover. This header is configured in `vercel.json`; a different host must carry
over and review those headers.

## Out of scope

- Real Aadhaar, government PKI, or document parsing.
- Revocation and credential status.
- Device binding and attestation.
- Sybil resistance across applications.
- Distributed abuse detection and edge-level rate limiting.
- Audit logging and retention policy.
- Legal compliance and data-protection review.
- Mobile native clients.

## Dependency audit

The 2026-11-18 npm audit found no advisories in production dependencies. The full
dependency tree reported a low-severity advisory for `elliptic@6.6.1`, brought in
through the development-only `circomlibjs` → `ethers` chain. The advisory concerns
ECDSA signature generation; this repository uses Circomlibjs for BabyJubjub
EdDSA-Poseidon and Poseidon fixture generation, not the affected ECDSA signing path.
The advisory lists no patched release, so do not force an incompatible downgrade;
recheck the dependency tree when an upstream fix is available. See the [GitHub
Advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84).

## Production checklist

- Replace the demo issuer with a controlled issuer and protect its private key.
- Run a public powers-of-tau ceremony or use a production proving service.
- Set a high-entropy `CHALLENGE_SECRET`.
- Configure Redis and verify `store_ready` in health checks.
- Disable `AEGIS_DEMO`.
- Pin `APP_ID` per environment and verify the registry address, chain id, and active
  issuer key hash.
- Configure Vercel Firewall controls for distributed abuse and monitor the built-in
  endpoint limits.
- Monitor `STORE_UNAVAILABLE`, `PROOF_INVALID`, and `DUPLICATE_NULLIFIER` rates.
- Publish the circuit, verification key, and build instructions.
- Add a revocation design before claiming real-world eligibility.
