#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${CIRCUITS_DIR}/.." && pwd)"
SNARKJS="${ROOT_DIR}/node_modules/.bin/snarkjs"
BUILD_DIR="${CIRCUITS_DIR}/build"

echo "=== Building Trivial Circuit ==="
mkdir -p "${BUILD_DIR}"

# 1. Compile Circom
echo "[1/6] Compiling circuits/trivial.circom..."
circom "${CIRCUITS_DIR}/trivial.circom" --r1cs --wasm --sym -o "${BUILD_DIR}"

# 2. Powers of Tau (small ceremony for testing, power 8 = 256 constraints)
echo "[2/6] Generating test Powers of Tau (power 8)..."
if [ ! -f "${BUILD_DIR}/pot8_final.ptau" ]; then
  "${SNARKJS}" powersoftau new bn128 8 "${BUILD_DIR}/pot8_0000.ptau" -v
  "${SNARKJS}" powersoftau contribute "${BUILD_DIR}/pot8_0000.ptau" "${BUILD_DIR}/pot8_0001.ptau" --name="AegisID-M0" -v -e="some random text"
  "${SNARKJS}" powersoftau prepare phase2 "${BUILD_DIR}/pot8_0001.ptau" "${BUILD_DIR}/pot8_final.ptau" -v
fi

# 3. Groth16 Setup
echo "[3/6] Running Groth16 setup..."
"${SNARKJS}" groth16 setup "${BUILD_DIR}/trivial.r1cs" "${BUILD_DIR}/pot8_final.ptau" "${BUILD_DIR}/trivial_0000.zkey"
"${SNARKJS}" zkey contribute "${BUILD_DIR}/trivial_0000.zkey" "${BUILD_DIR}/trivial_final.zkey" --name="Contributor 1" -v -e="another random text"

# 4. Export Verification Key
echo "[4/6] Exporting verification_key.json..."
"${SNARKJS}" zkey export verificationkey "${BUILD_DIR}/trivial_final.zkey" "${BUILD_DIR}/verification_key.json"

# 5. Create test input
echo "[5/6] Creating test input..."
cat <<EOF > "${BUILD_DIR}/input.json"
{
  "a": "3",
  "b": "11"
}
EOF

# 6. Prove & Verify on desktop
echo "[6/6] Proving and verifying on desktop..."
"${SNARKJS}" groth16 fullprove "${BUILD_DIR}/input.json" "${BUILD_DIR}/trivial_js/trivial.wasm" "${BUILD_DIR}/trivial_final.zkey" "${BUILD_DIR}/proof.json" "${BUILD_DIR}/public.json"
"${SNARKJS}" groth16 verify "${BUILD_DIR}/verification_key.json" "${BUILD_DIR}/public.json" "${BUILD_DIR}/proof.json"

echo "=== Trivial Circuit Build & Test Successful ==="
