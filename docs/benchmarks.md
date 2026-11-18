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

Five runs:

| Stage              |    Median |   Minimum |   Maximum |
| ------------------ | --------: | --------: | --------: |
| Witness generation |   41.2 ms |   40.3 ms |   42.8 ms |
| Proving            |  260.5 ms |  260.0 ms |  269.3 ms |
| Verification       |    6.1 ms |   5.77 ms |   6.63 ms |
| Peak memory        |  772.3 MB |  685.7 MB |  843.7 MB |
| Proof JSON         | 722 bytes | 720 bytes | 724 bytes |

The first run is labelled cold and the rest warm. The harness reloads the proving key
for each proof, so the difference mostly reflects process and cache warm-up.

A separate run executed while the test suite was also running produced a 563 ms
median proving time. Do not benchmark while other CPU-heavy work is active.

## Browser smoke test

The same machine was driven with headless Chrome against a local server:

| Observation                             | Value                          |
| --------------------------------------- | ------------------------------ |
| First proof generation, adult fixture   | 348 to 361 ms                  |
| Server-side verification in the request | 7.9 to 11.2 ms                 |
| Page width at 390 px                    | 390 px, no horizontal overflow |
| Test bench                              | 8 of 8 cases passed            |

These are smoke-test numbers from a desktop browser. They are not a mobile benchmark
and do not include the first download of the 2.5 MB WASM and 5.0 MB proving key.

## Interpretation

- Proving dominates the cost; verification is cheap enough for a request handler.
- The proof is under 1 KB as JSON, so response size is not a concern.
- Peak memory is dominated by the Node process and the proving key. A server does not
  need this memory because proving happens in the browser.
- The browser must download about 7.5 MB of artifacts on first use. HTTP caching makes
  later proofs cheaper, but a cold mobile connection will notice the download.

## Limitations

Do not treat these numbers as a service-level objective. They come from one machine
and a small number of runs. Mobile CPUs, thermal throttling, browser worker
availability, and network conditions change the result substantially. Measure the
deployment you intend to operate, with the browser and device you intend to support,
before making latency claims.

The setup and verification key are development artifacts. Performance is not evidence
of production readiness.
