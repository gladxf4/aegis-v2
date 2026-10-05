# Changelog

All notable changes to the AegisID project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Initial project repository structure following `AGENT_BRIEF.md`.
- `CHANGELOG.md` and `DECISIONS.md` tracking development progress and architectural decisions.
- Initial documentation in `docs/`:
  - `STATEMENT.md`: Formal zero-knowledge relation and I/O signals.
  - `NULLIFIER_DESIGN.md`: Nullifier derivations, entropy requirements, and privacy trade-offs.
  - `PROOF_SYSTEMS.md`: Trade-off matrix comparing Groth16, PLONK/Halo2, and zkVMs.
  - `THREAT_MODEL.md`: Security invariants and trust boundaries.
  - `REUSED_COMPONENTS.md`: Dependency tracking and third-party licence registry.
- Trivial Circom circuit (`circuits/trivial.circom`) and automated compilation/proving pipeline (`circuits/scripts/build_trivial.sh`).
- Verified Groth16 witness calculation, proof generation, and verification pipeline on BN128 curve.

