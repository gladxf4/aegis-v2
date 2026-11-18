# Proof system

## Summary

| Property          | Value                           |
| ----------------- | ------------------------------- |
| Proof system      | Groth16                         |
| Curve             | BN254                           |
| Constraint count  | 9,713                           |
| Private inputs    | 7                               |
| Public inputs     | 4                               |
| Public outputs    | 1                               |
| Witness generator | Circom 2.2 compiled WebAssembly |
| Browser prover    | snarkjs 0.7.6                   |
| Signature scheme  | EdDSA-Poseidon on BabyJubjub    |

## Why EdDSA-Poseidon

The original project brief described RSA-2048 with SHA-256 over a signed document.
That construction is expensive in a SNARK: RSA verification needs big-integer
modular exponentiation, and SHA-256 needs a large bit-level circuit. It also forces
the circuit to parse a document and extract fields, which adds byte-level constraints
and edge cases.

This build uses EdDSA-Poseidon instead:

- the issuer signs `Poseidon(dob, credential_uid)` with a BabyJubjub key;
- the circuit verifies that signature with Circomlib's
  `EdDSAPoseidonVerifier`;
- the circuit hashes the issuer public key with Poseidon and compares it to the
  trusted hash;
- the credential fields are structured circuit inputs rather than bytes parsed from
  a document.

The trade-off is explicit: this is not compatible with an RSA-signed government
credential. It demonstrates the privacy property with a signature scheme that fits a
small circuit. A production system would need either an RSA or ECDSA verifier in the
circuit, or an issuer that signs a structured commitment natively.

## Signature equation

For a private key `sk`, public key `A = sk * B8`, message `M`, and signature
`(R8, S)`:

```text
S * B8 = R8 + h * 8 * A
h = Poseidon(R8x, R8y, A.x, A.y, M)
```

The message is:

```text
M = Poseidon(dob, credential_uid)
```

The verifier also constrains:

```text
S < subgroup_order
A is on the BabyJubjub curve
R8 is on the BabyJubjub curve
```

Circomlib's `EdDSAPoseidonVerifier` performs these checks. The circuit uses
`enabled = 1`, so the equality is enforced.

## Trusted issuer binding

A signature check alone would let any key sign an age claim. The circuit therefore
exposes:

```text
issuer_key_hash = Poseidon(issuer_ax, issuer_ay)
```

The server pins `issuer_key_hash` from `config/issuer.json` or `ISSUER_KEY_HASH`.
Because the key coordinates are private, a proof does not reveal which trusted key
signed the credential unless the application already knows the issuer set.

This is a real binding: changing the key changes the hash and fails the constraint.
The previous design hashed a credential identifier and compared it to an issuer hash,
which a prover could satisfy without a signature.

## Age predicate

Dates are integers in `YYYYMMDD` form. Eighteen years is represented as `180000`, so:

```text
cutoff = ref_date - 180000
dob <= cutoff
```

The circuit also constrains `ref_date >= 180000` so the subtraction cannot wrap below
zero. This encoding is valid for the supported date range and does not account for
leap days; the comparison is exact at the day level and treats the same month and day
eighteen years earlier as the boundary.

## Nullifier

```text
nullifier = Poseidon(credential_uid, app_id)
```

The nullifier is deterministic for one credential and one application. It is not a
global person identifier. See [nullifiers.md](nullifiers.md).

## Nonce

`nonce` is a public input. The circuit squares it and constrains the result, which
keeps the signal in the R1CS instead of allowing the compiler to discard an unused
input. Groth16 binds all public inputs to the proof, and the server compares the
nonce with the challenge token.

## Setup

The build script uses a power-14 powers-of-tau file and a two-step Groth16 setup:

```bash
snarkjs powersoftau new bn128 14 pot14_0000.ptau
snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau -e <random>
snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau
snarkjs groth16 setup age_proof.r1cs pot14_final.ptau age_proof_0000.zkey
snarkjs zkey contribute age_proof_0000.zkey age_proof_final.zkey -e <random>
snarkjs zkey export verificationkey age_proof_final.zkey age_proof_verification_key.json
```

Entropy comes from `crypto.randomBytes(32)` on each run and is not committed. This is
still a development setup with a single contributor. It is not a substitute for a
public ceremony with independent participants. Anyone who can reconstruct the toxic
waste could forge proofs for the circuit.

## Artifacts

| File                                             |   Size | Committed | Purpose             |
| ------------------------------------------------ | -----: | --------- | ------------------- |
| `app/artifacts/age_proof.wasm`                   | 2.5 MB | Yes       | Witness generation  |
| `app/artifacts/age_proof_final.zkey`             | 5.0 MB | Yes       | Groth16 proving     |
| `circuits/build/age_proof_verification_key.json` | 3.6 KB | Yes       | Server verification |
| `circuits/build/age_proof.r1cs`                  | 1.7 MB | No        | Constraint system   |
| `circuits/build/age_proof.sym`                   | 1.4 MB | No        | Debug symbols       |

The browser downloads the WASM and proving key on first use. The verification key is
small and loaded by the API function.

## Verification cost

`snarkjs.groth16.verify` took a median of 6.1 ms in the Node harness on an Apple M5.
The API adds request parsing, signal checks, and state-store operations. Browser
proving took around 350 ms for the same circuit on the same machine, plus download
time on the first use.

These are development measurements, not a production service-level guarantee. See
[benchmarks.md](benchmarks.md).

## What the proof does not establish

- It does not establish that a government issued the credential.
- It does not establish that the credential has not been revoked.
- It does not bind the credential to a device or a person.
- It does not hide the application id, reference date, nonce, or issuer key hash.
- It does not prevent the same credential from being used in another application;
  it produces a different nullifier there by design.
- It does not protect against a compromised browser or a malicious prover
  environment.

Those properties require issuer governance, revocation infrastructure, device
attestation, and operational controls outside this circuit.
