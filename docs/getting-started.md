# Getting started

## Requirements

| Tool    | Version        | Notes                                          |
| ------- | -------------- | ---------------------------------------------- |
| Node.js | 20.19 or newer | Needed by the lint toolchain                   |
| npm     | 10 or newer    | Uses the committed lockfile                    |
| Circom  | 2.2 or newer   | Only needed to rebuild the circuit             |
| Redis   | Optional       | Upstash or Vercel KV REST API for shared state |

The repository includes the compiled WASM, proving key, verification key, browser
snarkjs bundle, trusted issuer configuration, and signed demo credentials. A fresh
checkout can run the UI without Circom.

## Install and run

```bash
npm ci
npm start
```

The local server listens on <http://localhost:3000>. It serves the static app from
`app/` and the API from `api/`.

The local default configuration is:

- application name: `aegisid-web`
- challenge lifetime: 300 seconds
- state: process-local memory
- demo mode: on, because `NODE_ENV` is not `production`

## Verify a credential

1. Open the Verify view and choose a signed sample credential, or import a credential
   JSON file from your device.
2. Select **Verify eligibility**. The browser generates a proof locally and submits it
   to the verifier automatically.
3. The receipt shows the nullifier, verification time, state store, and reference date.

Imported credentials are parsed in memory. The browser sends only the proof, public
signals, and challenge token to the verifier.

The first proof downloads the 3.1 MiB WASM and 5.0 MiB proving key. Later proofs reuse
the HTTP cache.

The minor, incomplete-KYC, expired, and altered-signature credentials fail during
witness generation. The unrecognized issuer produces a valid proof under a different
key; the server rejects it with `UNTRUSTED_ISSUER`.

## Run the tests

```bash
npm test
```

The suite covers:

- a valid adult proof;
- witness failure for an incomplete-KYC credential;
- witness failure for an expired credential;
- witness failure for an underage credential;
- witness failure for an altered signature;
- a valid proof from an untrusted issuer;
- nullifier changes with the application id;
- challenge creation, tampering, expiry, and application binding;
- memory store challenge and nullifier semantics;
- API acceptance and rejection paths, including replay and duplicate nullifiers.

Circuit rejection messages from `snarkjs` are expected during the negative tests.

## Rebuild the circuit

Install Circom first, then:

```bash
npm run build:circuits
```

The script compiles `circuits/age_proof.circom`, creates a power-14 powers-of-tau
file when one is not already present, runs Groth16 setup, contributes fresh entropy,
exports the verification key, and copies the browser artifacts into `app/`.

Generated outputs:

```text
circuits/build/age_proof.r1cs
circuits/build/age_proof.sym
circuits/build/age_proof_js/age_proof.wasm
circuits/build/age_proof_final.zkey
circuits/build/age_proof_verification_key.json
app/artifacts/age_proof.wasm
app/artifacts/age_proof_final.zkey
```

`circuits/build/age_proof_verification_key.json` is required at runtime and is
committed. The proving key and WASM are committed in `app/artifacts/` for the
deployment. Other build outputs are local.

## Create a new demo issuer and credentials

```bash
npm run issuer:init
```

This creates `issuer/keypair.json` if it does not exist, writes
`config/issuer.json`, signs six acceptance fixtures in `app/credentials.json`, and
creates 1,024 public synthetic samples in `config/demo-samples.json`. The private key
is gitignored. To replace an existing key:

```bash
node issuer/init.js --rotate
```

Rotating the key changes the trusted hash, acceptance fixtures, and sample pool. Update
the Sepolia registry to the new hash and reconfigure the app before using the new issuer.
Key rotation does not change the circuit, proving key, or verification key.

## Benchmark the prover

```bash
npm run bench -- --runs 30
npm run bench:export
```

Results are written to `bench/results/`. The exporter writes
`bench/export/results.csv` and `bench/export/summary.md`. See
[benchmarks.md](benchmarks.md) for methodology.

## Configuration

Local development works without environment variables. The production-relevant
variables are:

| Variable                   | Required          | Purpose                                                  |
| -------------------------- | ----------------- | -------------------------------------------------------- |
| `CHALLENGE_SECRET`         | Yes in production | HMAC key for challenge tokens                            |
| `APP_ID`                   | No                | Application name used to derive the field element app id |
| `ISSUER_KEY_HASH`          | No                | Overrides the trusted hash from `config/issuer.json`     |
| `CHALLENGE_TTL_SECONDS`    | No                | Challenge lifetime, default 300, maximum 3600            |
| `AEGIS_DEMO`               | No                | `1` enables `POST /api/reset`; keep unset in production  |
| `UPSTASH_REDIS_REST_URL`   | No                | Redis REST endpoint                                      |
| `UPSTASH_REDIS_REST_TOKEN` | No                | Redis REST token                                         |
| `KV_REST_API_URL`          | No                | Vercel KV alias for the Redis URL                        |
| `KV_REST_API_TOKEN`        | No                | Vercel KV alias for the Redis token                      |
| `PORT`                     | No                | Local server port, default 3000                          |

## Troubleshooting

**`circom: command not found`** — install Circom and confirm `circom --version`
works. `npm start` does not need Circom.

**`missing circuits/build/age_proof_verification_key.json`** — restore the committed
file or run `npm run build:circuits`.

**`SERVER_NOT_CONFIGURED`** — set `CHALLENGE_SECRET` and confirm
`config/issuer.json` exists.

**`STORE_UNAVAILABLE`** — both Redis variables must be set. If only one is present,
the server fails closed by design.

**`POST /api/reset` returns 404** — demo mode is off. Set `AEGIS_DEMO=1` locally.
Leave it off in production.

**The browser takes a few seconds on the first proof** — it is downloading the WASM
and proving key. Subsequent proofs reuse the cache.

**Worker or memory warning from snarkjs** — the browser prover is single-threaded
unless the page is cross-origin isolated. It still completes, but slower.
