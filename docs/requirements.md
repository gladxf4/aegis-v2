# Requirements and acceptance cases

## Goal

Demonstrate a complete zero-knowledge age-verification flow in a browser:

1. an issuer signs a synthetic credential;
2. the holder proves, in the browser, that the credential is valid and the date of
   birth is at least 18 years before a verifier reference date;
3. the verifier checks the proof, rejects replayed challenges and reused credentials,
   and learns no private credential field.

## Functional requirements

| ID  | Requirement                                                                               |
| --- | ----------------------------------------------------------------------------------------- |
| F1  | The circuit verifies an issuer signature over the credential fields                       |
| F2  | The circuit binds the signing key to a trusted issuer key hash                            |
| F3  | The circuit proves `dob <= ref_date - 180000`                                             |
| F4  | The circuit derives a nullifier from the credential and application id                    |
| F5  | The browser generates the proof without sending private inputs to the server              |
| F6  | The server issues a signed, expiring challenge with a nonce                               |
| F7  | The server rejects a proof whose signals do not match the challenge                       |
| F8  | The server rejects a proof from an untrusted issuer                                       |
| F9  | The server rejects a used challenge                                                       |
| F10 | The server rejects a duplicate nullifier for the application                              |
| F11 | The state store can be process-local or Redis-backed                                      |
| F12 | The UI exposes verification, a test bench, and the protocol relation                      |
| F13 | The deployment is a static site plus serverless API functions                             |
| F14 | Public demos can request a pre-signed synthetic sample without disabling nullifier checks |
| F15 | Challenge and proof endpoints enforce shared per-address request limits                   |
| F16 | Production readiness requires shared Redis for replay and rate-limit state                |

## Acceptance cases

| Case                      | Expected result                                            | Where it is covered                            |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Valid adult credential    | `200`, `verified: true`                                    | `tests/proof.test.js`, `tests/api.test.js`, UI |
| Underage credential       | Witness generation fails                                   | `tests/proof.test.js`, UI                      |
| Altered signature         | Witness generation fails                                   | `tests/proof.test.js`, UI                      |
| Unrecognized issuer       | Valid proof, `400 UNTRUSTED_ISSUER`                        | `tests/proof.test.js`, `tests/api.test.js`, UI |
| Wrong application id      | `400 APP_MISMATCH`                                         | `tests/api.test.js`, UI                        |
| Wrong nonce               | `400 NONCE_MISMATCH`                                       | `tests/api.test.js`, UI                        |
| Replayed token            | First `200`, second `409 CHALLENGE_USED`                   | `tests/api.test.js`, UI                        |
| Duplicate credential      | `409 DUPLICATE_NULLIFIER`                                  | `tests/api.test.js`, UI                        |
| Tampered public signal    | `400 PROOF_INVALID`                                        | UI                                             |
| Expired challenge         | `400 CHALLENGE_EXPIRED`                                    | `tests/challenge.test.js`                      |
| Malformed body or signals | `400` with a stable code                                   | `tests/api.test.js`                            |
| Wrong HTTP method         | `405 METHOD_NOT_ALLOWED`                                   | `tests/api.test.js`                            |
| Reset in demo mode        | `200`, registry cleared                                    | `tests/api.test.js`, UI                        |
| Reset outside demo mode   | `404`                                                      | `api/reset.js`                                 |
| Public demo sample        | `200` with one signed fixture from the finite pool         | `api/demo-sample.js`, UI                       |
| Production without Redis  | Health reports not ready; challenge and verify fail closed | `lib/config.js`, `api/health.js`               |
| Rate limit exceeded       | `429 RATE_LIMITED` with `Retry-After`                      | `lib/rate-limit.js`, challenge/verify APIs     |

## Non-functional requirements

| ID  | Requirement                                                            |
| --- | ---------------------------------------------------------------------- |
| N1  | Proof generation runs in under one second on a current desktop browser |
| N2  | Verification fits comfortably in a serverless request                  |
| N3  | The layout works at 390 px without horizontal page overflow            |
| N4  | The app has no front-end framework or build step                       |
| N5  | The repository runs from a fresh checkout without Circom               |
| N6  | The circuit and API can be tested with `npm test`                      |
| N7  | The benchmark records real timings and validates its schema            |
| N8  | The deployment has no private credential data in requests or logs      |
| N9  | Production requires shared Redis and exposes its rate-limit scope      |

## Out of scope

- Real identity documents, Aadhaar, or government PKI.
- RSA-2048 or SHA-256 document verification in-circuit.
- Revocation and credential status.
- Device binding or mobile native clients.
- On-chain verification.
- Cross-application Sybil resistance.
- Distributed abuse controls, audit logging, and a nullifier retention policy.
- Production trusted setup.

## Definition of done for this prototype

- `npm test` passes.
- `npm run bench -- --runs 3` produces records that validate against the schema.
- The browser test bench passes all eight cases with `AEGIS_DEMO=1`.
- A Vercel deployment returns `ok: true` from `/api/health` with the intended store.
- Documentation states the cryptographic and operational limitations without
  presenting the prototype as production identity assurance.
