#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${CIRCUITS_DIR}/.." && pwd)"
SNARKJS="${ROOT_DIR}/node_modules/.bin/snarkjs"
BUILD_DIR="${CIRCUITS_DIR}/build"

echo "=== Building Aegis Age Verification Circuit ==="
mkdir -p "${BUILD_DIR}"

# 1. Compile Circom
echo "[1/4] Compiling circuits/aegis_age.circom..."
circom "${CIRCUITS_DIR}/aegis_age.circom" --r1cs --wasm --sym -o "${BUILD_DIR}"

# 2. Powers of Tau (power 12 = 4096 constraints, perfect for ~1000 constraints circuit)
echo "[2/4] Generating Powers of Tau (power 12)..."
if [ ! -f "${BUILD_DIR}/pot12_final.ptau" ]; then
  "${SNARKJS}" powersoftau new bn128 12 "${BUILD_DIR}/pot12_0000.ptau" -v
  "${SNARKJS}" powersoftau contribute "${BUILD_DIR}/pot12_0000.ptau" "${BUILD_DIR}/pot12_0001.ptau" --name="AegisID-Ceremony" -v -e="entropy-aegis-18"
  "${SNARKJS}" powersoftau prepare phase2 "${BUILD_DIR}/pot12_0001.ptau" "${BUILD_DIR}/pot12_final.ptau" -v
fi

# 3. Groth16 Setup
echo "[3/4] Running Groth16 setup for aegis_age..."
"${SNARKJS}" groth16 setup "${BUILD_DIR}/aegis_age.r1cs" "${BUILD_DIR}/pot12_final.ptau" "${BUILD_DIR}/aegis_age_0000.zkey"
"${SNARKJS}" zkey contribute "${BUILD_DIR}/aegis_age_0000.zkey" "${BUILD_DIR}/aegis_age_final.zkey" --name="Aegis Prover" -v -e="more entropy for aegis"

# 4. Export Verification Key
echo "[4/4] Exporting aegis_age_verification_key.json..."
"${SNARKJS}" zkey export verificationkey "${BUILD_DIR}/aegis_age_final.zkey" "${BUILD_DIR}/aegis_age_verification_key.json"

echo "=== Aegis Age Circuit Built Successfully ==="
