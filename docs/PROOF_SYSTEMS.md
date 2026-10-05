# Proof System Comparison

This document tracks trade-offs between zero-knowledge proving systems evaluated for AegisID.

| Metric | Groth16 (MVP Baseline) | PLONK / Halo2 (Stretch) | zkVM (SP1 / RISC Zero) |
| :--- | :--- | :--- | :--- |
| **Proof System Family** | Pairing-based SNARK | Polynomial Interactive / KZG | STARK-to-SNARK wrapped zkVM |
| **Trusted Setup** | Per-circuit ceremony (Powers of Tau + phase 2) | Universal setup or transparent | Transparent (no trusted setup) |
| **Proof Size** | ~128-256 bytes (constant, 3 group elements) | ~400-800 bytes | ~1-200 KB (or ~250 bytes if SNARK wrapped) |
| **Mobile Proving Time** | Fast (native C++/NEON via rapidsnark: ~1-3s) | Moderate (~5-15s) | High on mobile (~30-120s+ without GPU) |
| **Mobile Memory Footprint** | Low (~50-150MB peak) | Medium (~200-500MB) | High (~1-2GB) |
| **Verification Cost** | Minimal (3 pairings, <5ms) | Low (<15ms) | Low (<15ms for wrapped) |
| **Engineering Complexity** | Specialized arithmetic circuits (Circom) | Halo2 circuit DSL | High-level Rust code |

## Evaluation Plan for Paper
- Benchmark the core RSA-2048 verification across architectures.
- Measure peak RAM and proving latency across mobile architectures.
