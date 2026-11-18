# Architecture

## Overview

AegisID separates the party that can read a credential from the party that checks a
predicate. The browser holds the credential and runs the prover. The server issues a
challenge, verifies the proof, and stores a nullifier.

```text
issuer/init.js
  |
  |  EdDSA-Poseidon signature over Poseidon(dob, credential_uid)
  v
app/credentials.json  --->  browser
                              |
                              |  GET /api/challenge
                              v
                         challenge token (nonce, app_id, ref_date, exp)
                              |
                              |  Groth16 proof in the browser
                              v
                         POST /api/verify
                              |
                              +--> verification key check
                              +--> trusted issuer hash check
                              +--> challenge consume
                              +--> nullifier record
                              |
                              v
                         accept or reject
```

## Components

### Circuit

`circuits/age_proof.circom` defines the relation. It uses Circomlib Poseidon,
comparators, and `EdDSAPoseidonVerifier`. The compiled output is 9,713 constraints
on BN254.

The circuit treats the issuer public key as private and exposes only
`Poseidon(issuer_ax, issuer_ay)` as the public issuer key hash. The verifier pins
that hash.

### Issuer tooling

`issuer/init.js` creates a BabyJubjub keypair, signs synthetic credentials, and writes:

- `issuer/keypair.json` — private key, local only, gitignored;
- `config/issuer.json` — public key and trusted key hash, committed;
- `app/credentials.json` — four signed fixtures, public by design.

The issuer is a development fixture, not a credential authority.

### Browser app

`app/` contains plain HTML, CSS, and JavaScript plus:

- `app/artifacts/age_proof.wasm` — witness generator;
- `app/artifacts/age_proof_final.zkey` — Groth16 proving key;
- `app/vendor/snarkjs.min.js` — unmodified snarkjs browser bundle;
- `app/credentials.json` — demo credentials.

Proof generation happens in the tab with `snarkjs.groth16.fullProve`. No private
input is posted to the server. The browser sends only the proof, the five public
signals, and the signed challenge token.

### API

The functions in `api/` export plain Node handlers. The same handlers run under
Vercel and under the local Express server.

| Handler            | Responsibility                                                 |
| ------------------ | -------------------------------------------------------------- |
| `api/challenge.js` | Create an HMAC-signed challenge and return verifier metadata   |
| `api/verify.js`    | Validate token and signals, verify Groth16 proof, record state |
| `api/health.js`    | Report readiness, store backend, and demo mode                 |
| `api/reset.js`     | Clear nullifiers for the current app when demo mode is on      |

### Shared server modules

| Module             | Responsibility                                        |
| ------------------ | ----------------------------------------------------- |
| `lib/config.js`    | Environment parsing, app id derivation, readiness     |
| `lib/challenge.js` | Token encoding, HMAC, payload validation, expiry      |
| `lib/store.js`     | Memory or Redis challenge and nullifier state         |
| `lib/http.js`      | JSON responses, method errors, body and query parsing |

### Local server

`server/app.js` mounts the API handlers and serves `app/` as static files.
`server/dev.js` starts it on `PORT`. This server exists for development and browser
testing; production uses Vercel.

### Tests and benchmarks

`tests/` uses the Node test runner and real artifacts. `bench/` measures the real
prover and validates each record against `bench/schema.json`.

## Request path

1. The browser requests a challenge.
2. The server creates a payload, signs it with HMAC-SHA256, and returns the token plus
   the public challenge fields.
3. The browser selects a credential and builds the circuit input:

   ```text
   private: dob, credential_uid, issuer_ax, issuer_ay,
            signature_r8x, signature_r8y, signature_s
   public:  ref_date, app_id, nonce, issuer_key_hash
   output:  nullifier
   ```

4. The browser proves locally.
5. The server decodes and verifies the token, checks that the public signals equal
   the token context and the trusted issuer hash, then verifies the proof.
6. The server consumes the challenge id and inserts the nullifier as one operation.
   Redis runs this through a Lua script, so concurrent function instances cannot split
   replay consumption from duplicate detection. The in-memory implementation performs
   the same transition synchronously within the process.

## Trust boundaries

| Boundary                     | What crosses it                                 |
| ---------------------------- | ----------------------------------------------- |
| Credential holder to browser | Credential fields and issuer signature          |
| Browser to verifier          | Proof, five public signals, challenge token     |
| Issuer to verifier           | Trusted public key hash, configured out of band |
| Verifier to state store      | Challenge ids and nullifiers                    |
| Operator to deployment       | Secrets, app id, trusted issuer hash            |

The verifier never receives the date of birth, credential UID, signature, or issuer
public key. It learns the app id, reference date, nonce, issuer key hash, and a
nullifier.

## Stateless and stateful parts

Challenges are stateless: the token carries its own payload and signature. The only
server-side state needed for replay protection is a record that a challenge id was
consumed. Nullifiers are the other stateful part.

With Redis configured, both are shared and survive function instances. Without
Redis, both live in process memory, which is suitable only for local development or
a single long-lived instance.

## Deployment shape

Vercel serves the static `app/` directory and routes `/api/*` to the functions. The
build command `node scripts/prepare-web.js` checks the required assets, copies the
current circuit artifacts into `app/`, and copies the snarkjs browser bundle into
`app/vendor/`.

See [deployment.md](deployment.md).
