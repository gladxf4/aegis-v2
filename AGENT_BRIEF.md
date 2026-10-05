# AegisID
---

## 1. Role and mission

You are a senior engineer building **AegisID**, a research-grade prototype of a mobile-native, zero-knowledge age-verification system. A user scans a signed government identity credential (a synthetic Aadhaar-style Secure QR), their phone generates a zero-knowledge proof that **age >= 18**, and a verifier website accepts or rejects the proof while learning **nothing else**: no date of birth, no name, no address.

This build serves two outputs: a **hackathon demo** (a working end-to-end flow that can be shown live in about 3 minutes) and a **research paper** (reproducible benchmarks and an analysis of privacy and uniqueness properties). Every decision should favour (a) a working demo and (b) measurable, reproducible results.

## 2. Scope

**In scope (MVP)**

- One credential type: a synthetic, UIDAI-style signed QR payload (RSA-2048 signature over SHA-256 of the data).
- One predicate: `age >= 18` evaluated against a verifier-supplied reference date.
- Client-side proof generation on a mobile device (Android first, iOS if time allows).
- Verifier SDK plus a demo relying-party website, with off-chain verification.
- App-scoped nullifiers, verifier-nonce and domain binding, replay protection.
- A benchmark harness producing machine-readable results for the paper.

**Stretch (only after MVP is demonstrably working)**

- Second proof system for comparison (see section 6).
- Device-bound holder key (Android Keystore / iOS Secure Enclave) bound into the proof.
- Optional on-chain verifier contract (Solidity) as an alternative deployment mode.
- Revocation via a Merkle non-membership proof or short-lived credentials.

**Explicit non-goals**

- No banking/KYC claims, no regulatory-compliance claims.
- No blockchain registry as a required component.
- No real personal data. **Use synthetic credentials only.** Never commit real Aadhaar data, never store Aadhaar numbers, and never log credential contents.
- No custom cryptographic primitives. Use audited or widely used libraries.

## 3. Architecture

```
+-------------------+   signed QR (synthetic)   +---------------------------+
| Test Issuer Tool  | ------------------------> |  Mobile Wallet (Prover)   |
| (generates keys & |                           |  - QR scan / import       |
|  signed payloads) |                           |  - parse + validate       |
+-------------------+                           |  - ZK prover (native)     |
                                                |  - secure local storage   |
                                                +------------+--------------+
                                                             | proof + public signals
                                                             | (via deep link / QR / HTTPS)
+-------------------+   challenge (nonce,       +------------v--------------+
| Demo Relying      | <-------------------------+  Verifier SDK + Backend   |
| Party Website     |   app_id, ref_date)       |  - issues challenges      |
| ("age gate")      | -------------------------> |  - verifies proof         |
+-------------------+   verified / rejected     |  - stores nullifiers      |
                                                +---------------------------+

+----------------------------------------------------------------------+
| Benchmark Harness: runs prover on desktop + real devices, emits JSON |
+----------------------------------------------------------------------+
```

### Components

1. **Test Issuer Tool** (`/issuer`): CLI that generates an RSA-2048 keypair and produces synthetic signed credentials in the same byte layout the circuit expects. Exports the issuer public key. This stands in for the real issuer and keeps the project free of real data.
2. **Circuits** (`/circuits`): the zero-knowledge statement (section 4) and its tests.
3. **Mobile Wallet** (`/wallet`): scans or imports the credential, runs the native prover, returns the proof to the verifier. Must never transmit the raw credential anywhere.
4. **Verifier SDK + Backend** (`/verifier`): TypeScript library and small server. Issues single-use challenges, verifies proofs, enforces nonce expiry, records nullifiers.
5. **Demo Website** (`/demo-site`): a mock service (for example an age-restricted storefront) that embeds the verifier SDK and shows the flow.
6. **Benchmark Harness** (`/bench`): scripts and result schemas (section 8).
7. **Docs** (`/docs`): architecture notes, threat model stub, reproduction instructions, and a `REUSED_COMPONENTS.md` listing every third-party component and licence.

## 4. The zero-knowledge statement

Implement exactly this relation, and document it in `/docs/STATEMENT.md`.

**Private inputs**

- The signed payload bytes (including date of birth and the credential's uniqueness field).
- The RSA signature.
- Offsets/lengths needed to locate fields within the payload.

**Public inputs**

- `issuer_pubkey_hash`: hash of the issuer's RSA modulus (the verifier checks this against its trusted-issuer list).
- `ref_date`: the reference date supplied by the verifier.
- `app_id`: the domain/identifier of the relying party.
- `nonce`: single-use verifier challenge.
- `nullifier`: output, see below.

**The circuit must prove**

1. The RSA-2048 signature over SHA-256(payload) is valid under the key whose hash is `issuer_pubkey_hash`.
2. The date of birth extracted from the payload satisfies `age(ref_date) >= 18`.
3. `nullifier = Poseidon(credential_uid, app_id)`, where `credential_uid` is derived from fields inside the signed payload.
4. `nonce` and `app_id` are bound into the proof (they are public inputs constrained in the circuit, so a proof cannot be replayed on another verifier or session).

**Design decision to document, not silently pick:** a nullifier derived only from signed data is deterministic per credential per app (good for one-account-per-credential) but is vulnerable to dictionary attacks if the source field has low entropy. Hash a sufficiently large part of the signed payload into `credential_uid`, and write the trade-off in `/docs/NULLIFIER_DESIGN.md`. Do not claim per-person uniqueness; the guarantee is per-credential per-app.

## 5. Recommended stack (verify before committing)

Check current versions and licences before choosing. These are suggested starting points, not requirements.

- **Circuits and desktop baseline:** circom + snarkjs with Groth16, building on the open-source RSA/SHA-256 circom components (for example those used by Anon Aadhaar). Record exactly which parts you reused.
- **Mobile proving:** a native prover such as rapidsnark, or a mobile proving toolkit (for example mopro) that wraps it for Android/iOS. Evaluate what actually builds on your toolchain in the first day; do not commit until a trivial circuit proves on a real phone.
- **Wallet app:** React Native or Kotlin (Android first). Prefer whatever the chosen mobile prover integrates with most easily.
- **Verifier:** TypeScript (Node), `snarkjs` verification, a small HTTP server, SQLite for nullifiers and challenges.
- **Demo site:** a minimal web page (Next.js or plain HTML/JS).
- **Tests:** circuit tests (circom\_tester), unit tests for parsing, integration tests for the full flow.

## 6. Proof-system comparison (needed for the paper)

The MVP uses Groth16. Design the circuit boundary and benchmark harness so a second backend can be swapped in with minimal changes: either a Halo2/PLONK-style system or a zkVM (RISC Zero or SP1) running the same statement. Even a partial second implementation (RSA verification only) is valuable. Keep a table in `/docs/PROOF_SYSTEMS.md` noting setup requirements (trusted setup or not), proof size, and developer effort.

## 7. Security requirements

- Challenge nonces are random (at least 128 bits), single-use, and expire in at most 5 minutes. Store and invalidate on use.
- Reject proofs whose `app_id` does not match the verifier's own, whose nonce is unknown or used, or whose `issuer_pubkey_hash` is not on the trusted list.
- Nullifiers are recorded per `app_id`; a repeated nullifier is flagged as a duplicate claim.
- The verifier receives only: proof, public signals, and standard HTTP metadata. Add a test asserting that no request or response contains the DOB, name, or raw payload.
- The wallet stores the credential encrypted at rest using the platform keystore. No analytics, no crash logs containing credential data.
- Pin dependency versions and commit lockfiles. Do not log secrets.
- Be explicit in docs about the trusted setup used and that the ceremony for the prototype is **not** production-grade.

## 8. Benchmark harness (feeds the thesis)

Create `/bench` so results are reproducible and exportable. For every run record:

- Device model, SoC, RAM, OS version, build type, thermal state if available.
- Circuit constraint count, proving key size, witness-generation time, proving time, peak memory, proof size, verification time.
- Cold vs warm runs; at least **30 runs** per configuration, reporting median, p95, and standard deviation.
- Output as JSON using a fixed schema (`/bench/schema.json`) plus a script that turns results into CSV and ready-to-plot tables.
- Desktop baseline plus **at least two real mobile devices** (one mid-range Android minimum).

When results exist, write a `RESULTS_SUMMARY.md` containing the raw numbers only, with no interpretation beyond describing what was measured. Never invent or extrapolate numbers; if a measurement is missing, say so.

## 9. Milestones and acceptance criteria

1. **M0, feasibility (do first):** a trivial circuit proves and verifies on a real phone with the chosen toolchain. If not, report the blocker and propose alternatives before continuing.
2. **M1, desktop end-to-end:** issuer tool produces a credential; the circuit proves `age >= 18`; the verifier accepts valid proofs and rejects wrong-age, wrong-nonce, wrong-app, reused-nonce, and tampered-signature cases. All covered by automated tests.
3. **M2, mobile prover:** the same proof generated on a phone, with benchmark numbers recorded.
4. **M3, full demo:** wallet scans a QR from the demo site, returns the proof, and the site shows "verified" without ever receiving personal data. Includes a duplicate-nullifier demonstration.
5. **M4, evaluation:** full benchmark runs, second proof-system backend (even partial), results files committed.
6. **M5, stretch:** device-bound key, revocation, on-chain verifier, in that priority order.

The MVP is done when M1 to M3 pass and `README.md` lets a stranger reproduce the demo in under 30 minutes.

## 10. Repository layout

```
aegisid/
  AGENT_BRIEF.md
  README.md
  circuits/        # circom sources, tests, build scripts
  issuer/          # synthetic credential generator
  wallet/          # mobile app + native prover bindings
  verifier/        # SDK + backend
  demo-site/       # relying-party demo
  bench/           # harness, schema, results/
  docs/            # STATEMENT, NULLIFIER_DESIGN, PROOF_SYSTEMS,
                   # THREAT_MODEL, REUSED_COMPONENTS
```

## 11. Working rules for the agent

- Work milestone by milestone. After each one, summarise what works, what was tested, and what is still open.
- Before writing code for a milestone, state your plan and any assumptions in a few lines.
- Prefer small, tested commits. Run tests before declaring anything done.
- If a requirement is ambiguous or a library does not behave as expected, say so and propose options. Do not silently change the statement, the scope, or the security rules.
- Never fabricate benchmark data, library features, or UIDAI format details. Where the real Secure QR format matters, check the current official specification and note the version you used; the synthetic issuer should mimic it, not copy real data.
- Keep a running `CHANGELOG.md` and a `DECISIONS.md` recording every non-obvious design choice with its reasoning. The thesis agent will read these files.
- Do not add features outside the scope above without asking.

## 12. First action

Start with M0. Report back with: the toolchain you picked, proof of a trivial circuit running on a device or emulator (state which), and your plan for M1.
