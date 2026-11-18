# Benchmarks

The harness measures the real prover, not a model. It generates a proof for the
adult fixture in `app/credentials.json`, verifies it, and records each stage
separately.

```bash
node bench/harness.js --runs 30
node bench/export.js
```

Output lands in `bench/results/` as one JSON file per invocation. `bench/export.js`
writes `bench/export/results.csv` and `bench/export/summary.md`.

## What is measured

| Field              | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `witness_gen_ms`   | Building the witness from the input signals                    |
| `proving_ms`       | Groth16 proving with the `.zkey`, excluding witness generation |
| `verification_ms`  | `snarkjs.groth16.verify`                                       |
| `peak_memory_mb`   | Peak RSS sampled every 25 ms while proving                     |
| `proof_json_bytes` | Size of the proof as JSON, which is what the browser sends     |

The harness validates every record against `bench/schema.json` before writing the
file. The constraint count comes from the `.r1cs` rather than a hard-coded value.

## Reading the numbers

Node timings are indicative only. The browser prover runs in a different runtime
and pays for fetching the 3.1 MiB witness generator and the 5.0 MiB proving key.
Measure a deployment with browser performance tooling before making claims about
user-perceived latency.

Do not compare these numbers with mobile benchmarks from another runtime, and do
not present a single run as the cost of the system. Use the median and the range.

## Environment variables

| Variable              | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `BENCH_DEVICE_MODEL`  | Overrides the reported device name                     |
| `BENCH_DEVICE_SOC`    | Overrides the reported SoC                             |
| `BENCH_BUILD_TYPE`    | `debug` or `release`                                   |
| `BENCH_THERMAL_STATE` | `nominal`, `fair`, `serious`, `critical`, or `unknown` |
