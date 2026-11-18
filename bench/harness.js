#!/usr/bin/env node
"use strict";

// Runs the prover N times and records timing and memory for each run.
// Witness generation, proving, and verification are measured separately.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const snarkjs = require("snarkjs");
const Ajv = require("ajv");
const { config } = require("../lib/config");

const root = path.join(__dirname, "..");
const build = path.join(root, "circuits", "build");
const resultsDir = path.join(__dirname, "results");
const schema = require("./schema.json");

function parseArgs(argv) {
  const args = { runs: 30, warm: false, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--runs" && argv[i + 1]) {
      args.runs = Number(argv[++i]);
    }
    if (argv[i] === "--warm") {
      args.warm = true;
    }
    if (argv[i] === "--out" && argv[i + 1]) {
      args.out = argv[++i];
    }
    if (argv[i] === "--help") {
      console.log("usage: node bench/harness.js [--runs N] [--warm] [--out path]");
      process.exit(0);
    }
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  return args;
}

function platform() {
  const map = { darwin: "macos", linux: "linux", win32: "windows" };
  return map[process.platform] || "linux";
}

function deviceInfo() {
  const cpu = os.cpus()[0];
  const thermal = process.env.BENCH_THERMAL_STATE;
  const allowed = ["nominal", "fair", "serious", "critical", "unknown"];
  return {
    model: process.env.BENCH_DEVICE_MODEL || (cpu && cpu.model) || "unknown",
    soc: process.env.BENCH_DEVICE_SOC || (cpu && cpu.model) || "unknown",
    ram_gb: Math.round((os.totalmem() / 1e9) * 10) / 10,
    os: platform(),
    os_version: os.release(),
    build_type: process.env.BENCH_BUILD_TYPE === "debug" ? "debug" : "release",
    thermal_state: allowed.includes(thermal) ? thermal : "unknown"
  };
}

function statistics(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  const round = (value) => Math.round(value * 100) / 100;
  return {
    n,
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
    median: round(median),
    p95: round(p95),
    mean: round(mean),
    stddev: round(Math.sqrt(variance))
  };
}

function quietLogger() {
  return { info() {}, warn() {}, error() {}, debug() {} };
}

function currentRefDate() {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0")
  ].join("");
}

function memorySampler() {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) {
      peak = rss;
    }
  }, 25);
  timer.unref();
  return () => {
    clearInterval(timer);
    return peak;
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const wasm = path.join(build, "age_proof_js", "age_proof.wasm");
  const zkey = path.join(build, "age_proof_final.zkey");
  const vkeyFile = path.join(build, "age_proof_verification_key.json");
  const r1cs = path.join(build, "age_proof.r1cs");

  for (const file of [wasm, zkey, vkeyFile, r1cs]) {
    if (!fs.existsSync(file)) {
      throw new Error(`missing ${path.relative(root, file)}; run npm run build:circuits`);
    }
  }

  const credentialsFile = path.join(root, "app", "credentials.json");
  const credential = JSON.parse(fs.readFileSync(credentialsFile, "utf8")).credentials.find(
    (item) => item.id === "adult"
  );
  if (!credential) {
    throw new Error("adult credential fixture is missing");
  }

  const vkey = JSON.parse(fs.readFileSync(vkeyFile, "utf8"));
  const r1csInfo = await snarkjs.r1cs.info(r1cs, quietLogger());
  const zkeyBytes = fs.statSync(zkey).size;
  const device = deviceInfo();

  const circuit = {
    name: "age_proof",
    constraint_count: r1csInfo.nConstraints,
    proving_key_size_bytes: zkeyBytes,
    proof_system: "groth16",
    curve: "bn128",
    prover_backend: "snarkjs-wasm"
  };

  fs.mkdirSync(resultsDir, { recursive: true });
  const runs = [];
  const startedAll = Date.now();

  console.log("AegisID benchmark");
  console.log(`  runs: ${args.runs}`);
  console.log(`  constraints: ${circuit.constraint_count}`);
  console.log(`  device: ${device.model}`);
  console.log();

  for (let i = 0; i < args.runs; i += 1) {
    const nonce = BigInt(`0x${crypto.randomBytes(16).toString("hex")}`).toString();
    const input = {
      dob: credential.dob,
      credential_uid: credential.uid,
      issuer_ax: credential.issuer.publicKey.x,
      issuer_ay: credential.issuer.publicKey.y,
      signature_r8x: credential.signature.r8x,
      signature_r8y: credential.signature.r8y,
      signature_s: credential.signature.s,
      ref_date: currentRefDate(),
      app_id: config.appId,
      nonce,
      issuer_key_hash: credential.issuer.keyHash
    };

    const wtns = path.join(os.tmpdir(), `aegisid-${process.pid}-${i}.wtns`);
    const stopSampler = memorySampler();

    const witnessStart = process.hrtime.bigint();
    await snarkjs.wtns.calculate(input, wasm, wtns);
    const witnessEnd = process.hrtime.bigint();

    const proveStart = process.hrtime.bigint();
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtns);
    const proveEnd = process.hrtime.bigint();

    const verifyStart = process.hrtime.bigint();
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    const verifyEnd = process.hrtime.bigint();

    const peakRss = stopSampler();
    fs.rmSync(wtns, { force: true });

    if (!valid) {
      throw new Error(`run ${i + 1} produced an invalid proof`);
    }

    const ms = (start, end) => Math.round((Number(end - start) / 1e6) * 100) / 100;
    const proofJsonBytes = Buffer.byteLength(JSON.stringify(proof));
    const record = {
      run_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      device,
      circuit,
      run_type: args.warm ? "warm" : i === 0 ? "cold" : "warm",
      witness_gen_ms: ms(witnessStart, witnessEnd),
      proving_ms: ms(proveStart, proveEnd),
      verification_ms: ms(verifyStart, verifyEnd),
      peak_memory_mb: Math.round((peakRss / 1e6) * 10) / 10,
      proof_size_bytes: 256,
      proof_json_bytes: proofJsonBytes,
      public_signals_count: publicSignals.length
    };

    runs.push(record);
    if ((i + 1) % 5 === 0 || i === 0) {
      console.log(
        `  run ${String(i + 1).padStart(3)}/${args.runs}: ` +
          `witness ${record.witness_gen_ms.toFixed(0)} ms, ` +
          `prove ${record.proving_ms.toFixed(0)} ms, ` +
          `verify ${record.verification_ms.toFixed(1)} ms`
      );
    }
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  for (const record of runs) {
    if (!validate(record)) {
      throw new Error(`benchmark record does not match schema: ${ajv.errorsText(validate.errors)}`);
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total_runs: args.runs,
    total_wall_time_ms: Date.now() - startedAll,
    witness_gen_ms: statistics(runs.map((run) => run.witness_gen_ms)),
    proving_ms: statistics(runs.map((run) => run.proving_ms)),
    verification_ms: statistics(runs.map((run) => run.verification_ms)),
    peak_memory_mb: statistics(runs.map((run) => run.peak_memory_mb)),
    proof_size_bytes: 256,
    proof_json_bytes: statistics(runs.map((run) => run.proof_json_bytes)),
    circuit,
    device
  };

  const outFile =
    args.out || path.join(resultsDir, `run_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify({ summary, runs }, null, 2)}\n`);

  console.log();
  console.log(`  prove median: ${summary.proving_ms.median} ms`);
  console.log(`  verify median: ${summary.verification_ms.median} ms`);
  console.log(`  peak memory: ${summary.peak_memory_mb.max} MB`);
  console.log(`  results: ${path.relative(root, outFile)}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
