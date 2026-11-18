# Deployment

## Target

The repository deploys to Vercel as:

- a static site from `app/`;
- Node functions from `api/`;
- a build step that checks the circuit artifacts and copies the snarkjs browser
  bundle into `app/vendor/`.

`vercel.json` sets the build command, output directory, function memory, and cache
headers. No framework preset is needed.

## First deployment

```bash
npm i -g vercel
vercel login
vercel
```

Vercel reads `vercel.json`. For the production deployment:

```bash
vercel --prod
```

The project can also be imported from a Git repository in the Vercel dashboard. Use
the repository root as the project root and leave the framework preset empty.

The repository includes a GitHub Actions workflow. After the first push, it runs the
lint rules, the proof and API suite, and the same static-asset preparation used by
Vercel. Fix a failed check before promoting a deployment.

## Required environment variables

| Variable                | Required    | Example                             |
| ----------------------- | ----------- | ----------------------------------- |
| `CHALLENGE_SECRET`      | Yes         | output of `openssl rand -base64 32` |
| `APP_ID`                | Recommended | `aegisid-production`                |
| `CHALLENGE_TTL_SECONDS` | No          | `300`                               |
| `ISSUER_KEY_HASH`       | No          | defaults to `config/issuer.json`    |

Set them for the environments you use:

```bash
openssl rand -base64 32
vercel env add CHALLENGE_SECRET production
vercel env add APP_ID production
```

Redeploy after changing an environment variable. Vercel does not inject new values
into an existing deployment.

`CHALLENGE_SECRET` is the HMAC key for challenge tokens. Rotating it invalidates
outstanding challenges but leaves nullifiers intact.

`APP_ID` is a name. The server hashes it with SHA-256 and reduces the result into the
BN254 scalar field. Use a different name per environment, because the app id scopes
every nullifier.

`ISSUER_KEY_HASH` overrides the trusted hash in `config/issuer.json`. Only set it when
the issuer key is managed outside the repository. It must be the decimal Poseidon hash
of the issuer public key.

## Shared state

Without Redis, each function instance has its own memory store. That breaks challenge
consumption and duplicate detection across instances. Use Redis for any deployment
that can scale beyond one instance.

### Upstash Redis

Install Upstash Redis from the Vercel Marketplace and connect it to the project. The
integration provides:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

### Vercel KV

The store also accepts the Vercel KV names:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Both the URL and the token must be present. If only one is set, the verifier fails
closed with `STORE_UNAVAILABLE` instead of silently using memory.

Redis keys:

```text
aegis:challenge:<challenge id>
aegis:nullifiers:<app id>
```

## Demo mode

`AEGIS_DEMO=1` exposes `POST /api/reset`, which clears nullifiers for the current
application. The Test bench uses it to run all acceptance cases repeatedly.

Leave `AEGIS_DEMO` unset in production. A public reset endpoint lets any visitor clear
the duplicate-protection registry. If you need a public demo, deploy it as a separate
project with a separate app id and store.

When demo mode is off:

- `/api/reset` returns `404`;
- the reset button is hidden;
- every Test bench case is disabled because the fixtures share one-time nullifiers.

The local test server enables demo mode by default. Use it to run the acceptance cases
repeatedly against a disposable in-memory store.

## Build behavior

The Vercel build runs:

```bash
node scripts/prepare-web.js
```

It verifies that `app/artifacts/age_proof.wasm`,
`app/artifacts/age_proof_final.zkey`, `config/issuer.json`,
`app/credentials.json`, and `circuits/build/age_proof_verification_key.json` exist.
It copies the current circuit build into `app/artifacts/` and the snarkjs browser
bundle into `app/vendor/`.

The artifacts in this repository are committed, so the build does not need Circom.
If you rebuild the circuit locally, commit the updated files or let the build copy
them from `circuits/build/`.

## Health check

After deployment:

```bash
curl https://<project>.vercel.app/api/health
```

Expected production shape:

```json
{
  "ok": true,
  "store": "redis",
  "store_ready": true,
  "challenge_configured": true,
  "issuer_configured": true,
  "demo_mode": false
}
```

If `ok` is false, inspect `challenge_configured`, `issuer_configured`, `store`, and
`store_ready`.

## Integrate from another service

The API is same-origin by default. It does not send CORS headers. A browser client on
another origin needs a proxy or an explicit `Access-Control-Allow-Origin` header for
`/api/*`.

A minimal client sequence:

```js
const challenge = await fetch("/api/challenge").then((response) => response.json());

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  {
    dob: credential.dob,
    credential_uid: credential.uid,
    issuer_ax: credential.issuer.publicKey.x,
    issuer_ay: credential.issuer.publicKey.y,
    signature_r8x: credential.signature.r8x,
    signature_r8y: credential.signature.r8y,
    signature_s: credential.signature.s,
    ref_date: challenge.challenge.ref_date,
    app_id: challenge.challenge.app_id,
    nonce: challenge.challenge.nonce,
    issuer_key_hash: credential.issuer.keyHash
  },
  "/artifacts/age_proof.wasm",
  "/artifacts/age_proof_final.zkey"
);

const result = await fetch("/api/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: challenge.token, proof, publicSignals })
}).then((response) => response.json());
```

Use a fresh challenge for every verification attempt. Do not cache or reuse a token
after a successful response.

## Local production simulation

```bash
NODE_ENV=production \
CHALLENGE_SECRET="$(openssl rand -base64 32)" \
APP_ID=aegisid-production \
npm start
```

With `NODE_ENV=production` and no `AEGIS_DEMO`, reset is disabled. Use Redis variables
if you want to exercise the shared store locally.

## Rollback

Vercel keeps previous deployments. Rolling back changes the code but not the
environment variables or Redis data. A rollback to a deployment with a different
`APP_ID` or issuer hash will reject proofs until the configuration matches.

## Checklist

- [ ] `CHALLENGE_SECRET` set to at least 32 random bytes
- [ ] `APP_ID` set per environment
- [ ] Redis configured, `/api/health` reports `store: redis`
- [ ] `store_ready: true`
- [ ] `AEGIS_DEMO` unset
- [ ] trusted issuer hash confirmed
- [ ] artifacts present and cached correctly
- [ ] custom domain and TLS configured
- [ ] edge rate limiting considered
- [ ] logs and error rates monitored
- [ ] deployment does not claim production identity assurance
