# Benchmarks

## Method

`bench/harness.js` generates a proof for the adult fixture with the real circuit
artifacts, verifies it with the exported verification key, and records each stage
separately. Every record is checked against `bench/schema.json` before it is written.

```bash
npm run bench -- --runs 5
npm run bench:export
```

The harness measures:

- witness generation with `snarkjs.wtns.calculate`;
- Groth16 proving with `snarkjs.groth16.prove`;
- verification with `snarkjs.groth16.verify`;
- peak RSS sampled every 25 ms;
- proof size as JSON.

The constraint count is read from the `.r1cs`, not hard-coded.

## Recorded run

Environment:

| Property    | Value        |
| ----------- | ------------ |
| Date        | 2026-11-18   |
| Device      | Apple M5     |
| OS          | macOS 27.0.0 |
| Node.js     | 26.12.1      |
| Prover      | snarkjs-wasm |
| Circuit     | `age_proof`  |
| Constraints | 9,969        |

Five runs, 2026-11-18:

| Stage              |    Median |   Minimum |   Maximum |
| ------------------ | --------: | --------: | --------: |
| Witness generation |  56.97 ms |  56.13 ms |  69.36 ms |
| Proving            |  381.8 ms | 370.33 ms | 383.53 ms |
| Verification       |    8.9 ms |    6.4 ms |   9.02 ms |
| Peak memory        |  767.2 MB |  717.2 MB |  883.8 MB |
| Proof JSON         | 722 bytes | 721 bytes | 725 bytes |

The first run is labelled cold and the rest warm. The harness reloads the proving key
for each proof, so the difference mostly reflects process and cache warm-up.

A run executed while the test suite was also active produced slower results. Keep
other CPU-heavy processes idle when collecting comparable measurements.

## Browser smoke test

On 2026-11-18, the local demo was opened in a Chromium-based browser. A synthetic
credential produced a proof that the local verifier accepted. Arrow-key navigation
from the Test bench tab to the Protocol tab also worked. This was a functional smoke
check, not a mobile-device or WCAG conformance audit. We did not measure the page at a
390 px viewport in this revision.

## Interpretation

- Proving dominates the cost; verification is cheap enough for a request handler.
- The proof is under 1 KB as JSON, so response size is not a concern.
- Peak memory is dominated by the Node process and the proving key. A server does not
  need this memory because proving happens in the browser.
- The browser must download about 8.1 MiB of artifacts on first use. HTTP caching makes
  later proofs cheaper, but a cold mobile connection will notice the download.

## Limitations

Do not treat these numbers as a service-level objective. They come from one machine
and a small number of runs. Mobile CPUs, thermal throttling, browser worker
availability, and network conditions change the result substantially. Measure the
deployment you intend to operate, with the browser and device you intend to support,
before making latency claims.

The setup and verification key are development artifacts. Performance is not evidence
of production readiness.
