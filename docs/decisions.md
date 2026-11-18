# Decisions

## ADR-001: Verify a real signature in the circuit

**Context.** The earlier circuit compared a prover-supplied binding to a hash and
called that issuer authentication. A prover could compute the same value without a
signature.

**Decision.** Use Circomlib `EdDSAPoseidonVerifier` over BabyJubjub. The issuer signs
`Poseidon(dob, credential_uid, kyc_verified, expires_at)`. The circuit constrains the
signature and the trusted issuer key hash.

**Consequences.** The relation now depends on a real signature check. The original
age-only relation used 9,713 constraints; adding signed KYC status and expiry brought
the current circuit to 9,969. The scheme is not RSA, so it is not compatible with the
original document format.

## ADR-002: Prove in the browser

**Context.** The earlier server accepted credential fields and generated the proof,
which meant the verifier received the private inputs.

**Decision.** Generate the proof in the browser with `snarkjs.groth16.fullProve`. The
server receives only the proof, public signals, and challenge token.

**Consequences.** Private inputs no longer cross the network. The browser must
download about 8.1 MiB of artifacts and spend a few hundred milliseconds proving on a
desktop. The server cannot inspect or log private inputs even if asked to.

## ADR-003: Use stateless HMAC challenge tokens

**Context.** A challenge endpoint can store nonces in a database, but that adds a state
dependency to every challenge request.

**Decision.** Sign the challenge payload with HMAC-SHA256 and return it as a token.
Store only the challenge id when it is consumed.

**Consequences.** Challenge issuance is cheap and works across instances. The secret
must be protected. Token validity is limited by the expiry and the clock.

## ADR-004: Scope nullifiers by application

**Context.** A global nullifier would let applications correlate a person across
services.

**Decision.** Derive `Poseidon(credential_uid, app_id)` inside the circuit.

**Consequences.** Each application sees a stable pseudonym and cannot link it to
another application's nullifier without additional context. Reissuing a credential
produces a new nullifier.

## ADR-005: Redis when available, memory otherwise

**Context.** A local demo should start without external services, but a multi-instance
deployment needs shared state.

**Decision.** Use Upstash or Vercel KV REST when both URL and token are set. Use a
process-local map otherwise. Fail closed when only one Redis variable is set.

**Consequences.** Local development has no setup. Production must configure Redis.
The memory backend loses state on restart and is not shared between instances.

## ADR-006: Hash the application name into the field

**Context.** Circom inputs are field elements. Application names are strings.

**Decision.** Compute SHA-256 of `APP_ID`, interpret it as a big-endian integer, reduce
it modulo the BN254 scalar field, and map zero to one.

**Consequences.** The mapping is deterministic and collision-resistant for practical
purposes. Changing the name changes every nullifier.

## ADR-007: Ship synthetic credentials and a local issuer

**Context.** Real identity documents are not available for a prototype and should not
be placed in a repository.

**Decision.** The first version generated four signed fixtures: adult, minor, altered
signature, and unrecognized issuer. The current generator adds incomplete-KYC and
expired cases as well.

**Consequences.** The demo is reproducible. The fixtures are public and must not be
treated as credentials. The private issuer key is gitignored.

## ADR-008: Development-only trusted setup

**Context.** A production Groth16 key needs a ceremony with independent contributors.

**Decision.** Build with a power-14 powers-of-tau file and fresh random entropy on
each build. Document the limitation prominently.

**Consequences.** The build is reproducible and fast. The setup is not secure against
an adversary who can recover the toxic waste.

## ADR-009: Remove the on-chain and mobile stubs

**Context.** The working path is a browser prover and an HTTP verifier. An on-chain
verifier and a native mobile prover were not tested against this circuit and would
need separate artifacts and maintenance.

**Decision.** The earlier iteration removed an untested contract and mobile stub to
keep the demo focused on a working browser prover and HTTP verifier. The current
`IssuerRegistry.sol` is a narrowly scoped trust anchor, not an on-chain proof verifier.

**Consequences.** Groth16 proof verification remains server-side. The testnet contract
stores only a public issuer-key hash; a native prover remains future work.

## ADR-010: Plain front end without a build step

**Context.** The UI is a test surface, not a product application. A framework would add
tooling without improving the protocol.

**Decision.** Use plain HTML, CSS, and JavaScript. Serve it statically from `app/`.
Bundle snarkjs as a single vendored script.

**Consequences.** The deployment has no front-end build. The UI is small and readable.
It does not need a component framework or a state library.
