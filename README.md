# AegisID — private age checks for online services

A working prototype of zero-knowledge age verification. A credential holder proves
that their date of birth is at least 18 years before a verifier-supplied reference
date. The proof is generated in the browser. The server verifies the proof and
records an application-scoped nullifier. The request does not contain the date of
birth, credential identifier, signature, or full issuer key. The issuer key hash is
public verification metadata and is included in the proof signals.

This is a research prototype with synthetic credentials. It is not a production
identity system and does not process real government documents.

## Why this prototype is useful

Most age gates ask for a full birth date or a copy of an identity document. AegisID
shows the alternative end to end: import a signed credential, prove one age rule in the
browser, and return a verifier receipt without transmitting the date of birth or
credential identifier. The holder can inspect the exact disclosure before proceeding.

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
- Age predicate evaluated against a verifier-selected reference date.
- Application-scoped nullifier derived inside the circuit.
- Browser-side Groth16 proving with `snarkjs`.
- Stateless, HMAC-signed challenge tokens with expiry and a single-use challenge id.
- Redis-backed challenge and nullifier state when configured, with a process-local
  fallback for development.
- Static front end plus Vercel functions for challenge, verification, health, and
  an optional demo reset.
- Node test suite covering the circuit, challenge tokens, state store, and HTTP API.
- Benchmark harness that records witness generation, proving, verification, memory,
  and proof size.

## Quick start

Requirements: Node.js 20.19 or newer and Circom 2.2 or newer.

```bash
npm ci
npm start
```

Open <http://localhost:3000>. The compiled artifacts and demo credentials are part
of the repository, so a fresh checkout runs without rebuilding the circuit.

Useful commands:

```bash
npm run format:check     # check Markdown, HTML, CSS, JSON, and JavaScript formatting
npm run lint              # check JavaScript style and common errors
npm test                  # circuit, token, store, and API tests
npm run bench -- --runs 3 # measure the real prover
npm run bench:export      # write CSV and Markdown summaries
npm run build:circuits    # rebuild circuit, keys, and browser artifacts
npm run issuer:init       # create a local issuer key and new demo credentials
```

`npm run build:circuits` needs Circom on `PATH`. `npm run issuer:init` writes
`issuer/keypair.json`, which is gitignored; the matching public key and signed demo
credentials are safe to publish.

## Request flow

1. `GET /api/challenge` returns an HMAC-signed token containing a random nonce, an
   application id, a UTC reference date, and an expiry.
2. The browser loads `app/credentials.json`, builds the circuit input, and calls
   `snarkjs.groth16.fullProve` with the local WASM and proving key.
3. `POST /api/verify` checks the token, the five public signals, the trusted issuer
   hash, and the Groth16 proof. It then consumes the challenge id and records the
   nullifier.

The public signals are, in order: `nullifier`, `ref_date`, `app_id`, `nonce`,
`issuer_key_hash`.

## API

| Method | Path             | Purpose                                              |
| ------ | ---------------- | ---------------------------------------------------- |
| `GET`  | `/api/challenge` | Issue a challenge token and verifier metadata        |
| `POST` | `/api/verify`    | Verify a proof and record its nullifier              |
| `GET`  | `/api/health`    | Report configuration, store backend, and demo mode   |
| `POST` | `/api/reset`     | Clear nullifiers for the current app; demo mode only |

Verification errors use a stable code in the `error` field, for example
`CHALLENGE_USED`, `DUPLICATE_NULLIFIER`, `UNTRUSTED_ISSUER`, `APP_MISMATCH`,
`NONCE_MISMATCH`, and `PROOF_INVALID`. See [docs/protocol.md](docs/protocol.md).

## User experience

The front end is plain HTML, CSS, and JavaScript. A holder can use a synthetic sample
or import a signed credential JSON file. Imported files are parsed in memory by the
browser and are never uploaded. One action generates the proof locally and sends it to
the verifier; the result includes a small verification receipt and a local session log.

The **Test bench** and **Protocol** views support judges and integrators without making
the primary experience feel like a developer console. The test bench runs eight
acceptance cases against the live API. Running all cases requires `AEGIS_DEMO=1`
because the cases share the same demo credential.

The app uses no client-side framework or build step. Vercel applies a restrictive
Content Security Policy that permits the local WebAssembly prover, while disallowing
third-party scripts and connections.

## Deployment

The repository is set up for Vercel: static output from `app/`, functions in `api/`,
and a build command that checks and syncs browser artifacts. Set `CHALLENGE_SECRET`
and configure shared Redis before relying on replay or duplicate protection in a
serverless deployment. Process-local memory is for local development only.

See [docs/deployment.md](docs/deployment.md) for the environment variables and the
deployment checklist.

## Repository layout

```text
api/                 Vercel functions
app/                 static front end, credentials, circuit artifacts, snarkjs bundle
bench/               benchmark harness, schema, exporter
circuits/            Circom source, build script, generated circuit artifacts
config/issuer.json   trusted public issuer key and key hash
issuer/init.js       local issuer key and demo credential generator
lib/                 config, challenge tokens, state store, HTTP helpers
scripts/             deployment asset preparation
server/              local Express server
tests/               Node test suite
docs/                architecture, protocol, security, deployment, benchmarks
```

## Security boundaries

- The demo issuer key is not a government issuer and the credentials are synthetic.
- The Groth16 key came from a single-party development setup, not a public ceremony.
- The application id is derived from a configured name with SHA-256 reduced into the
  BN254 scalar field. It identifies the application, not a person.
- The nullifier is unique per credential and application. Reissuing a credential
  produces a new nullifier.
- A process-local store is lost on restart and is not shared by multiple instances.
- There is no rate limiting, revocation, device binding, or audit logging in this
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
