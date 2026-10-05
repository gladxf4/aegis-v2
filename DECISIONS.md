# Architectural Decision Records (ADR) - AegisID

This document records architectural, cryptographic, and engineering decisions made during the design and implementation of AegisID.

---

## ADR-0001: Initial Architecture & Milestone Scoping

- **Date:** 2026-10-06
- **Status:** Accepted
- **Context:**
  The project requires a research-grade prototype and mobile-native zero-knowledge age verification (`age >= 18`) using synthetic Aadhaar-style signed credentials (RSA-2048 SHA-256).
- **Decision:**
  We structure the repository into modular components per `AGENT_BRIEF.md`:
  - `/circuits`: Circom circuits, Groth16 proving system, circom_tester tests.
  - `/issuer`: Synthetic credential generator mimicking the Secure QR format without real PII.
  - `/verifier`: TypeScript SDK and HTTP backend with single-use nonces, expiry, and app-scoped nullifiers.
  - `/wallet`: Mobile application hosting the mobile prover.
  - `/demo-site`: Relying-party demo showcase.
  - `/bench`: Reproducible benchmark harness and schema.
  - `/docs`: Formal statement, nullifier analysis, threat model, and reused components registry.
- **Consequences:**
  Strict separation allows independent unit/integration testing of circuits and verifier logic on desktop (M1) while working on mobile prover integration (M0/M2).
