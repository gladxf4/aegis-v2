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

| Variable                          | Required    | Example                             |
| --------------------------------- | ----------- | ----------------------------------- |
| `CHALLENGE_SECRET`                | Yes         | output of `openssl rand -base64 32` |
| `APP_ID`                          | Recommended | `aegisid-production`                |
| `CHALLENGE_TTL_SECONDS`           | No          | `300`                               |
| `ISSUER_KEY_HASH`                 | No          | defaults to `config/issuer.json`    |
| `ISSUER_REGISTRY_ADDRESS`         | Optional    | deployed `IssuerRegistry` address   |
| `EVM_RPC_URL`                     | Optional    | Sepolia JSON-RPC endpoint           |
| `EVM_CHAIN_ID`                    | Optional    | `11155111` (Sepolia)                |
| `REQUIRE_ONCHAIN_ISSUER_REGISTRY` | Optional    | `1` to require chain registry       |

Set them for the environments you use:

```bash
openssl rand -base64 32
vercel env add CHALLENGE_SECRET production
vercel env add APP_ID production
```

Redeploy after changing an environment variable. Vercel does not inject new values
into an existing deployment.

`CHALLENGE_SECRET` is the HMAC key for challenge tokens. Rotating it invalidates
outstanding challenges but leaves nullifiers intact. Production requires at least 32
UTF-8 bytes; generate a high-entropy value rather than choosing a phrase. Challenge
lifetimes are capped at one hour even if a larger value is configured.

`APP_ID` is a name. The server hashes it with SHA-256 and reduces the result into the
BN254 scalar field. Use a different name per environment, because the app id scopes
every nullifier.

`ISSUER_KEY_HASH` overrides the trusted hash in `config/issuer.json`. Only set it when
the issuer key is managed outside the repository. It must be the decimal Poseidon hash
of the issuer public key.

## Sepolia issuer registry

The public demo defaults to Sepolia (chain id `11155111`) when using the optional
on-chain registry. The registry stores only the issuer public-key hash; holder
credentials, Aadhaar details, proofs, and nullifiers stay off-chain. Without registry
environment variables, the demo uses the committed synthetic issuer hash and reports
`issuer_registry: "config"`.

To anchor the demo issuer on Sepolia:

1. Get Sepolia test ETH from a faucet and open [Remix](https://remix.ethereum.org/).
2. Create `IssuerRegistry.sol` in Remix and paste in
   `contracts/IssuerRegistry.sol`. Compile with Solidity `0.8.24` or compatible
   `0.8.x`.
3. In the deploy panel, select **Injected Provider - MetaMask**, confirm Sepolia,
   and deploy `IssuerRegistry` with the decimal `keyHash` from
   `config/issuer.json` converted to a 32-byte hex value. You can convert it locally:

   ```bash
   node -e 'const h=require("./config/issuer.json").keyHash; console.log("0x"+BigInt(h).toString(16).padStart(64,"0"))'
   ```

4. Copy the deployed contract address. Set `ISSUER_REGISTRY_ADDRESS`,
   `EVM_RPC_URL` (a Sepolia HTTPS RPC URL from a provider), `EVM_CHAIN_ID=11155111`,
   and `REQUIRE_ONCHAIN_ISSUER_REGISTRY=1` in Vercel for Production. Keep the RPC
   URL server-side; do not expose a provider key in browser JavaScript.
5. Redeploy and check `/api/health`. It should report `ok: true`,
   `issuer_registry: "sepolia"`, the contract address, and chain id `11155111`.

The contract owner can rotate the issuer hash with `setIssuerKeyHash(bytes32)`.
After a rotation, issue credentials under the new issuer key and update the public
issuer configuration and verifier artifacts together. The included synthetic issuer
and public samples are for demonstration only; anchoring their hash does not make them
real KYC credentials. Use a separate RPC provider key for production and configure
provider-side access restrictions and quotas.

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

Both the URL and the token must be present. Production health is not ready without
them. If only one is set, requests fail closed with `STORE_UNAVAILABLE`; the verifier
does not silently fall back to per-instance memory.

Redis keys:

```text
aegis:challenge:<challenge id>
aegis:nullifiers:<app id>
aegis:rate:<HMAC of app id, route, and client address>
```

Sample retrieval is limited to 30 requests per minute per address, challenge issuance
to 60 per minute, and proof verification to 20 per minute. The rate-limit key is derived
with the challenge secret and has a one-minute expiry. Redis is required in production
so the limits apply across function instances. Add Vercel Firewall rules for volumetric
or distributed abuse; application limits do not replace edge protection. Vercel overwrites
`X-Forwarded-For` with the client address; on another host, configure a trusted proxy to
replace inbound forwarding headers before they reach the app, or clients may spoof the
address used by this limiter. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).

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
`config/demo-samples.json`, `app/credentials.json`, and
`circuits/build/age_proof_verification_key.json` exist.
It copies the current circuit build into `app/artifacts/` and the snarkjs browser
bundle into `app/vendor/`.

The artifacts in this repository are committed, so the build does not need Circom.
If you rebuild the circuit locally, commit the updated files or let the build copy
them from `circuits/build/`.

`GET /api/demo-sample` returns one synthetic adult credential from the 1,024-entry
pre-signed sample pool. Each sample has a unique UID and remains one-use under the
normal nullifier check. The pool is a finite convenience for public demos, not an
issuance service.

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
  "shared_store_configured": true,
  "shared_store_required": true,
  "rate_limit_scope": "shared",
  "challenge_configured": true,
  "issuer_configured": true,
  "demo_mode": false
}
```

If `ok` is false, inspect `challenge_configured`, `issuer_configured`,
`issuer_registry`, `shared_store_configured`, `store`, and `store_ready`.

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
- [ ] rate limits report `rate_limit_scope: shared`
- [ ] Vercel Firewall rules considered for distributed abuse
- [ ] logs and error rates monitored
- [ ] deployment does not claim production identity assurance
