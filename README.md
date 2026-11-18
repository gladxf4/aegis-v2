# AegisID — reusable, privacy-preserving KYC proofs

[![Validate](https://github.com/gladxf4/aegis-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/gladxf4/aegis-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-blue.svg)](package.json)
[![Zero Knowledge](https://img.shields.io/badge/ZK-Groth16%20%7C%20BN254-orange.svg)](circuits/age_proof.circom)
[![Constraints](https://img.shields.io/badge/R1CS-9%2C969%20constraints-purple.svg)](docs/benchmarks.md)

AegisID explores how a holder could reuse an issuer-signed KYC credential without
re-uploading identity documents to every service. The browser proves that a trusted
issuer marked KYC complete, the credential is unexpired, and the holder is 18 or older.
The proof is generated locally; the verifier sees the claims and an app-scoped
pseudonym, not the source document, date of birth, credential UID, signature, or full
issuer key.

This is an India-first engineering prototype with synthetic credentials. Its demo
issuer does not inspect identity documents and does not perform real KYC. It does not
replace a regulated entity's CDD or V-CIP, connect to CKYCR or DigiLocker, or access
CIBIL data. A KYC/age proof is not parental consent or a DPDP compliance certificate.

## Chosen vertical

Digital identity and KYC for Indian fintech and other online onboarding flows. The
problem is repeated collection of identity documents when a service needs only a
specific eligibility claim. AegisID demonstrates how a holder might disclose an
issuer-backed claim such as “KYC complete” or “18+” without sending the underlying
date of birth or credential identifier to each relying service.

## Problems it targets

Every repeated check asks people to expose the same data again, while each service that
stores it becomes another place it can leak. AegisID changes the question from "send your
documents" to "prove the answer".

| Problem                                    | AegisID approach                                             | Status                   |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------ |
| Re-uploading Aadhaar, voter ID, or licence | Reuse one signed credential and send a proof                 | Shown in this demo       |
| Identity data exposed in breaches          | Verifiers keep a challenge record and app-specific pseudonym | Shown in this demo       |
| Repeat vKYC queues and offline KYC visits  | Accepting services could reuse one completed KYC result      | Needs a regulated issuer |
| Repeated OTP and form verification         | A device-generated proof could answer eligibility questions  | Needs a regulated issuer |
| Repeated credit checks after rejections    | A bureau could sign a score-band claim for lenders to verify | Future claim, not built  |
| Marksheets and other certificates          | Issuers could sign claims without sharing the full document  | Future claim, not built  |

## Approach and logic

An authorized issuer would verify the person and sign a structured, expiring
credential. The holder's browser proves that the signature is from a trusted issuer,
the KYC flag is complete, the credential is current, and the age rule passes. The
verifier checks the proof against a short-lived challenge, records a
service-scoped nullifier to prevent replay, and returns the claim result. In this
repository, the issuer and credentials are synthetic, so the demo proves the flow's
logic rather than anyone's real identity.

## How the solution works

1. The holder selects a synthetic sample or imports a compatible signed credential.
   Imported data stays in the browser.
2. The verifier issues an HMAC-signed challenge containing a nonce, application id,
   reference date, and trusted issuer hash.
3. A background worker uses the Circom circuit and Groth16 proving key to generate a
   proof locally, so the page stays responsive. The source date of birth, credential UID, KYC flag, credential expiry,
   signature, and issuer key are private inputs.
4. The verifier parses the request strictly, then checks the token, issuer trust,
   public signals, and proof. Shared Redis records challenge use and the app-scoped nullifier. The response reports
   “KYC complete” and “18+” without those private inputs.

The website and verifier API run on Vercel. An optional EVM registry stores only the
public issuer-key hash; it does not store a holder's data. The current deployment
uses the synthetic issuer hash from repository configuration until the Sepolia
registry is deployed and configured.

## Assumptions

- A real deployment has an authorized KYC issuer that performs the required identity
  checks, signs accurate claims, and manages expiry and revocation.
- Each relying service explicitly accepts that issuer and the credential format. A
  valid cryptographic proof alone does not establish that an underlying KYC process
  was legally sufficient.
- This prototype supports its own BabyJubjub EdDSA-Poseidon credential format. It
  does not parse or verify Aadhaar, CKYCR, DigiLocker, or CIBIL data.
- The demo trusts its generated issuer key and public synthetic fixtures. They must
  never be treated as real identity evidence.
- Age and expiry use the verifier's UTC date. Between midnight and 05:30 IST that date
  is still the previous day, so a birthday or expiry takes effect at 05:30 IST.
- The one-use nullifier rule is scoped to an application. Reuse across services is
  possible; repeated checks with the same credential at one service are blocked.

## Why this prototype is useful

Repeated onboarding can ask a person to upload the same identity files and reveal more
than a service needs. AegisID demonstrates the holder-side part of an alternative:
import a signed, expiring KYC credential, prove only KYC completion and 18+ in the
browser, and return a verifier result without transmitting the underlying identity
fields. A real issuer and relying service must authorize and accept this workflow.

The demo is designed to make the trade-offs visible to both sides:

- **For holders:** local credential import, one-action proving and verification, and a
  copyable result record that excludes direct identity fields.
- **For integrators:** a small challenge/verify API, app-scoped nullifiers, replay
  prevention, and a developer test bench with positive and negative cases.
- **For reviewers:** the Circom relation, trust assumptions, setup limits, and
  deployment requirements are documented in the repository.

The copied result record is an unsigned convenience artifact from this prototype. It
is not an independently verifiable credential or an authorization token.

## What is implemented

- Circom circuit with an actual EdDSA-Poseidon signature check on BabyJubjub.
  The issuer key is bound to a trusted key hash in-circuit.
- KYC-complete flag and expiry date are covered by the issuer signature and enforced
  in-circuit; the proof also checks the 18+ age predicate.
- Application-scoped nullifier derived inside the circuit.
- Browser-side Groth16 proving with `snarkjs`.
- Stateless, HMAC-signed challenge tokens with expiry and a single-use challenge id.
- Redis-backed challenge and nullifier state when configured, with a process-local
  fallback for development. Production requires shared Redis for state and request
  limits.
- Shared per-IP request limits for sample retrieval (30/minute), challenge issuance
  (60/minute), and proof verification (20/minute). Rate-limit keys are HMAC-derived
  and expire after one minute.
- Canonical public-signal parsing, so one nullifier has exactly one accepted spelling
  and cannot be padded to evade the duplicate check.
- Static front end plus Vercel functions for challenge, verification, health, and
  an optional demo reset, all sharing one request pipeline.
- Node test suite covering the circuit, API, state store, browser logic, and deployment
  configuration, with coverage thresholds enforced in CI.
- Benchmark harness that records witness generation, proving, verification, memory,
  and proof size.

## Quick start

Requirements: Node.js 20.19 or newer and Circom 2.2 or newer.

```bash
npm ci
npm start
```

Open <http://localhost:3000>. The compiled circuit, acceptance fixtures, and
pre-signed sample pool are included, so a fresh checkout runs without rebuilding the
circuit.

Useful commands:

```bash
npm run format:check     # check Markdown, HTML, CSS, JSON, and JavaScript formatting
npm run lint              # check JavaScript style and common errors
npm test                  # circuit, API, store, browser-logic, and deployment tests
npm run test:coverage     # the same tests with enforced coverage thresholds
npm run bench -- --runs 3 # measure the real prover
npm run bench:export      # write CSV and Markdown summaries
npm run build:circuits    # rebuild circuit, keys, and browser artifacts
npm run issuer:init       # create a local issuer key and new demo credentials
```

`npm run build:circuits` needs Circom on `PATH`. `npm run issuer:init` writes
`issuer/keypair.json`, which is gitignored, plus public acceptance fixtures and a pool
of synthetic one-time demo credentials.

## Request flow

1. The browser requests one pre-signed sample from `GET /api/demo-sample` or imports a
   credential file.
2. `GET /api/challenge` returns an HMAC-signed token containing a random nonce, an
   application id, a UTC reference date, an expiry, and the verifier's trusted issuer
   hash (from Sepolia when configured).
3. A web worker calls `snarkjs.groth16.fullProve` with the local WASM and proving key.
4. `POST /api/verify` checks the request shape, the token, the five public signals, the trusted issuer
   hash, and the Groth16 proof. It then consumes the challenge id and records the
   nullifier.

The public signals are, in order: `nullifier`, `ref_date`, `app_id`, `nonce`,
`issuer_key_hash`.

## API

| Method | Path               | Purpose                                              |
| ------ | ------------------ | ---------------------------------------------------- |
| `GET`  | `/api/challenge`   | Issue a challenge token and verifier metadata        |
| `GET`  | `/api/demo-sample` | Return one pre-signed synthetic sample credential    |
| `POST` | `/api/verify`      | Verify a proof and record its nullifier              |
| `GET`  | `/api/health`      | Report configuration, store backend, and demo mode   |
| `POST` | `/api/reset`       | Clear nullifiers for the current app; demo mode only |

Verification errors use a stable code in the `error` field, for example
`CHALLENGE_USED`, `DUPLICATE_NULLIFIER`, `UNTRUSTED_ISSUER`, `APP_MISMATCH`,
`NONCE_MISMATCH`, and `PROOF_INVALID`. See [docs/protocol.md](docs/protocol.md).

## User experience

The front end is plain HTML, CSS, and native JavaScript modules. A holder can use a synthetic sample
or import a signed credential JSON file. Imported files are parsed in memory by the
browser and are never uploaded. One action generates the proof locally and sends it to
the verifier; the result includes a small verification receipt and a local session log.
An expired idle request renews itself, so nobody has to race the countdown. Results are
announced to screen readers and receive keyboard focus when they arrive.

The **Test bench** and **Protocol** views support judges and integrators without making
the primary experience feel like a developer console. The test bench has ten
acceptance cases. All case runs are disabled on the public production deployment
because the fixtures share one-time nullifiers; run them locally with `AEGIS_DEMO=1`.

The app uses no client-side framework or build step. Vercel applies a restrictive
Content Security Policy that permits the local WebAssembly prover, while disallowing
third-party scripts and connections.

## Deployment

The repository is set up for Vercel: static output from `app/`, functions in `api/`,
and a build command that checks and syncs browser artifacts. Set `CHALLENGE_SECRET`
and configure shared Redis before relying on replay or duplicate protection in a
serverless deployment. The optional Sepolia `IssuerRegistry` anchors the synthetic
issuer key hash; its address and a server-side JSON-RPC URL are configured through
environment variables. Process-local memory is for local development only.

See [docs/deployment.md](docs/deployment.md) for the environment variables and the
deployment checklist.

## Repository layout

```text
api/                 thin Vercel function definitions
app/                 static page, styles, fixtures, circuit artifacts, snarkjs bundle
app/js/              browser modules and the proving worker
bench/               benchmark harness, schema, exporter
circuits/            Circom source, build script, generated circuit artifacts
config/              trusted issuer, demo sample pool, shared security headers
contracts/           EVM testnet issuer trust registry
issuer/init.js       local issuer key and demo credential generator
lib/                 request pipeline, verification, challenges, state, configuration
scripts/             deployment asset preparation
server/              local Express server
tests/               Node test suite
docs/                architecture, protocol, security, deployment, benchmarks
```

## Quality checks

| Area          | How it is checked                                                                 |
| ------------- | --------------------------------------------------------------------------------- |
| Code quality  | ESLint with a complexity limit, Prettier, small modules, one request pipeline     |
| Security      | Fail-closed production config, strict parsing, CSP, replay and duplicate tests    |
| Efficiency    | Worker proving, cached registry and health probes, prover loaded only when used   |
| Testing       | Real Groth16 proofs in API tests, plus CI coverage thresholds                     |
| Accessibility | Keyboard-operable controls, live status updates, focus management, reduced motion |
| Alignment     | Reusable KYC claims without resending identity documents or birth dates           |

## Security boundaries

- The demo issuer key is not a government issuer and the credentials are synthetic.
- The Groth16 key came from a single-party development setup, not a public ceremony.
- The application id is derived from a configured name with SHA-256 reduced into the
  BN254 scalar field. It identifies the application, not a person.
- The nullifier is unique per credential and application. Reissuing a credential
  produces a new nullifier.
- Process-local state is used only for local development and is lost on restart.
- Per-address endpoint limits are basic abuse controls; distributed attacks still
  require platform-level protection.
- There is no credential revocation, device binding, or operator audit log in this
  build.

See [docs/threat-model.md](docs/threat-model.md) for the full analysis.

## Documentation

- [Product objective and practical rollout scope](docs/product-scope.md)
- [Contributing and code style](CONTRIBUTING.md)
- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Protocol and API](docs/protocol.md)
- [Proof system](docs/proof-system.md)
- [Nullifiers](docs/nullifiers.md)
- [Threat model](docs/threat-model.md)
- [Benchmarks](docs/benchmarks.md)
- [Deployment](docs/deployment.md)
- [Decisions](docs/decisions.md)
- [Components and licences](docs/components.md)
- [Requirements and acceptance cases](docs/requirements.md)

## Licence

MIT for this repository. Circom, Circomlib, Circomlibjs, and snarkjs are GPL-3.0;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[docs/components.md](docs/components.md).
