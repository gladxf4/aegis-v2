# Protocol and API

## Relation

The circuit proves, for a credential signed by a trusted issuer, that:

```text
EdDSA-Poseidon.verify(
  issuer_public_key,
  signature,
  Poseidon(dob, credential_uid)
) = true

Poseidon(issuer_ax, issuer_ay) = issuer_key_hash
ref_date >= 180000
dob <= ref_date - 180000
nullifier = Poseidon(credential_uid, app_id)
```

The nonce is a public input and appears in the R1CS. Groth16 binds every public
input to the proof, and the server also compares the public signals with the
challenge payload.

## Signals

Private inputs:

| Signal                           | Meaning                           |
| -------------------------------- | --------------------------------- |
| `dob`                            | Date of birth as `YYYYMMDD`       |
| `credential_uid`                 | Random credential identifier      |
| `issuer_ax`, `issuer_ay`         | BabyJubjub public key coordinates |
| `signature_r8x`, `signature_r8y` | EdDSA nonce point                 |
| `signature_s`                    | EdDSA scalar                      |

Public inputs:

| Signal            | Meaning                                |
| ----------------- | -------------------------------------- |
| `ref_date`        | UTC reference date as `YYYYMMDD`       |
| `app_id`          | Application field element              |
| `nonce`           | 128-bit decimal challenge nonce        |
| `issuer_key_hash` | Poseidon hash of the issuer public key |

Public output:

| Signal      | Meaning                            |
| ----------- | ---------------------------------- |
| `nullifier` | `Poseidon(credential_uid, app_id)` |

`publicSignals` is returned in this order:

```text
[nullifier, ref_date, app_id, nonce, issuer_key_hash]
```

## Application id

`APP_ID` is a name, not a number. The server hashes it with SHA-256, interprets the
digest as a big-endian integer, and reduces it modulo the BN254 scalar field. A zero
result is mapped to 1. The default name is `aegisid-web`.

This keeps the id stable across restarts and deployments with the same name. Changing
`APP_ID` changes every nullifier for the application.

## Challenge token

The token is two base64url segments:

```text
base64url(payload).base64url(HMAC-SHA256(payload, CHALLENGE_SECRET))
```

Payload:

```json
{
  "v": 1,
  "cid": "3f4d3c6e-8a1f-4c0b-a0d1-2f6d3f5b7c90",
  "nonce": "252803779056730479610582043720063221",
  "app_id": "21362152712750642513792003393321278365851354122002433278320362367089583611068",
  "ref_date": "20261118",
  "iat": 1763445123,
  "exp": 1763445423
}
```

Rules enforced by the verifier:

- the HMAC is compared in constant time;
- `v` is 1;
- `cid` is a string;
- `nonce` is a decimal field element;
- `ref_date` is eight digits;
- `iat` and `exp` are integers;
- the token has not expired;
- `iat` is not more than 60 seconds in the future;
- `app_id` equals the configured application id.

The token is not a bearer credential for a user account. It only binds a proof to a
nonce, application, reference date, and expiry.

## Endpoints

### `GET /api/demo-sample`

Returns one randomly selected, pre-signed synthetic adult credential from the finite
public demo pool. The endpoint does not reserve or consume a credential; the normal
verification path consumes its nullifier after a successful proof. A client may pass
`?exclude=<uid>` to avoid receiving the sample it just tried. If another visitor used
the same sample first, request another and retry.

This endpoint is only a convenience for the public prototype. It does not issue real
credentials and is not an issuer API.

Response `200`:

```json
{
  "credential": {
    "id": "public-sample-38",
    "label": "Sample adult credential",
    "kind": "sample",
    "dob": "20010514",
    "uid": "<synthetic credential uid>",
    "issuer": { "keyHash": "<trusted hash>", "publicKey": { "x": "...", "y": "..." } },
    "signature": { "r8x": "...", "r8y": "...", "s": "..." }
  },
  "pool_size": 1024
}
```

### `GET /api/challenge`

Response `200`:

```json
{
  "token": "<payload>.<hmac>",
  "challenge": {
    "id": "3f4d3c6e-8a1f-4c0b-a0d1-2f6d3f5b7c90",
    "nonce": "252803779056730479610582043720063221",
    "app_id": "21362152712750642513792003393321278365851354122002433278320362367089583611068",
    "ref_date": "20261118",
    "issued_at": "2026-11-18T05:12:03.000Z",
    "expires_at": "2026-11-18T05:17:03.000Z",
    "ttl_seconds": 300
  },
  "verifier": {
    "app_name": "aegisid-web",
    "app_id": "21362152712750642513792003393321278365851354122002433278320362367089583611068",
    "issuer_key_hash": "9161555149647200950420109569256698233484789006482508020994125081537056888507",
    "store": "memory"
  }
}
```

Returns `503 SERVER_NOT_CONFIGURED` when the challenge secret or issuer configuration
is missing.

### `POST /api/verify`

Request:

```json
{
  "token": "<payload>.<hmac>",
  "proof": { "pi_a": [], "pi_b": [], "pi_c": [], "protocol": "groth16", "curve": "bn128" },
  "publicSignals": ["<nullifier>", "<ref_date>", "<app_id>", "<nonce>", "<issuer_key_hash>"]
}
```

Response `200`:

```json
{
  "verified": true,
  "challenge_id": "3f4d3c6e-8a1f-4c0b-a0d1-2f6d3f5b7c90",
  "nullifier": "5633922996972560272688258191336331688978696343647728708162359364532893731444",
  "ref_date": "20261118",
  "app_id": "21362152712750642513792003393321278365851354122002433278320362367089583611068",
  "issuer_key_hash": "9161555149647200950420109569256698233484789006482508020994125081537056888507",
  "verify_ms": 8.15,
  "store": "memory"
}
```

Rejection responses use `200` only for success. Errors return
`{ "verified": false, "error": "<code>", "message": "<text>" }`.

| Status | Code                    | Meaning                                                |
| ------ | ----------------------- | ------------------------------------------------------ |
| `400`  | `MALFORMED_BODY`        | Body is not a JSON object                              |
| `400`  | `MALFORMED_PROOF`       | Missing token, proof, or five public signals           |
| `413`  | `PROOF_TOO_LARGE`       | Proof payload exceeds 256 KB                           |
| `413`  | `BODY_TOO_LARGE`        | JSON request body exceeds the server limit             |
| `400`  | `CHALLENGE_INVALID`     | Bad signature, malformed payload, or future issue time |
| `400`  | `CHALLENGE_EXPIRED`     | Token expired                                          |
| `400`  | `APP_MISMATCH`          | Token or proof belongs to another application          |
| `400`  | `REF_DATE_MISMATCH`     | Proof reference date differs from the token            |
| `400`  | `NONCE_MISMATCH`        | Proof nonce differs from the token                     |
| `400`  | `UNTRUSTED_ISSUER`      | Issuer key hash is not trusted                         |
| `400`  | `PROOF_MALFORMED`       | Proof could not be parsed                              |
| `400`  | `PROOF_INVALID`         | Groth16 verification failed                            |
| `405`  | `METHOD_NOT_ALLOWED`    | Wrong HTTP method                                      |
| `409`  | `CHALLENGE_USED`        | Challenge id was already consumed                      |
| `409`  | `DUPLICATE_NULLIFIER`   | Credential already verified for this application       |
| `503`  | `SERVER_NOT_CONFIGURED` | Missing secret or issuer configuration                 |
| `503`  | `STORE_UNAVAILABLE`     | State store failed or is incomplete                    |

The server checks the challenge token and the public signals before running Groth16
verification, so mismatches fail without expensive work.

Challenge consumption happens before nullifier insertion. A proof with a valid
challenge but a duplicate nullifier consumes the challenge and returns
`DUPLICATE_NULLIFIER`.

### `GET /api/health`

Response `200`:

```json
{
  "ok": true,
  "version": "0.2.0",
  "app_name": "aegisid-web",
  "app_id": "21362152712750642513792003393321278365851354122002433278320362367089583611068",
  "issuer_key_hash": "9161555149647200950420109569256698233484789006482508020994125081537056888507",
  "issuer_configured": true,
  "challenge_configured": true,
  "challenge_ttl_seconds": 300,
  "store": "memory",
  "store_ready": true,
  "demo_mode": true
}
```

`ok` is true only when the challenge secret, issuer key hash, issuer public key, and
store are all usable.

### `POST /api/reset`

Demo mode only. Clears nullifiers for the configured application id.

```json
{ "reset": true, "cleared_nullifiers": 4, "store": "memory" }
```

Returns `404 NOT_FOUND` when `AEGIS_DEMO` is not `1` and `NODE_ENV` is `production`.
The local server enables demo mode by default.

## State transitions

```text
challenge issued
      |
      | proof accepted
      v
challenge consumed -----> used token returns CHALLENGE_USED
      |
      | first nullifier
      v
nullifier recorded -----> same credential returns DUPLICATE_NULLIFIER
```

A rejected proof does not consume the challenge unless the failure happens after
challenge consumption. In the current order, only a duplicate nullifier can produce
that outcome.
