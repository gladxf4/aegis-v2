#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD="$ROOT/circuits/build"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
CIRCOM="${CIRCOM:-circom}"
POWER=14

if ! command -v "$CIRCOM" >/dev/null 2>&1; then
  echo "circom not found. Install circom 2.0+ first." >&2
  exit 1
fi
if [ ! -x "$SNARKJS" ]; then
  echo "snarkjs not found. Run npm ci first." >&2
  exit 1
fi

mkdir -p "$BUILD"

echo "[1/5] compiling circuits/age_proof.circom"
"$CIRCOM" "$ROOT/circuits/age_proof.circom" \
  --r1cs --wasm --sym \
  -o "$BUILD"

echo "[2/5] preparing powers of tau (2^$POWER)"
if [ ! -f "$BUILD/pot${POWER}_final.ptau" ]; then
  "$SNARKJS" powersoftau new bn128 "$POWER" "$BUILD/pot${POWER}_0000.ptau" >/dev/null
  "$SNARKJS" powersoftau contribute \
    "$BUILD/pot${POWER}_0000.ptau" \
    "$BUILD/pot${POWER}_0001.ptau" \
    --name="aegisid-$(date +%s)" \
    -e="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')" >/dev/null
  "$SNARKJS" powersoftau prepare phase2 \
    "$BUILD/pot${POWER}_0001.ptau" \
    "$BUILD/pot${POWER}_final.ptau" >/dev/null
fi

echo "[3/5] running groth16 setup"
"$SNARKJS" groth16 setup \
  "$BUILD/age_proof.r1cs" \
  "$BUILD/pot${POWER}_final.ptau" \
  "$BUILD/age_proof_0000.zkey" >/dev/null

echo "[4/5] contributing to the circuit key"
"$SNARKJS" zkey contribute \
  "$BUILD/age_proof_0000.zkey" \
  "$BUILD/age_proof_final.zkey" \
  --name="aegisid-$(date +%s)" \
  -e="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')" >/dev/null

"$SNARKJS" zkey export verificationkey \
  "$BUILD/age_proof_final.zkey" \
  "$BUILD/age_proof_verification_key.json" >/dev/null

echo "[5/5] syncing browser artifacts"
node "$ROOT/scripts/prepare-web.js"

echo "built"
