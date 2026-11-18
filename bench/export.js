#!/usr/bin/env node
"use strict";

// Converts bench/results/*.json into a CSV and a Markdown summary.
//
//   node bench/export.js [--in <file-or-directory>] [--out-dir bench/export]

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { input: path.join(__dirname, "results"), outDir: path.join(__dirname, "export") };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--in" && argv[i + 1]) {
      args.input = path.resolve(argv[++i]);
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      args.outDir = path.resolve(argv[++i]);
    } else if (argv[i] === "--help") {
      console.log("usage: node bench/export.js [--in path] [--out-dir path]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

function readRuns(target) {
  if (!fs.existsSync(target)) {
    throw new Error(`no benchmark results at ${target}`);
  }
  const files = fs.statSync(target).isDirectory()
    ? fs
        .readdirSync(target)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => path.join(target, name))
    : [target];

  const runs = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(parsed.runs)) {
      runs.push(...parsed.runs);
    }
  }
  return runs;
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(runs) {
  const columns = [
    "run_id",
    "timestamp",
    "run_type",
    "device_model",
    "device_os",
    "device_os_version",
    "circuit_name",
    "constraint_count",
    "prover_backend",
    "witness_gen_ms",
    "proving_ms",
    "verification_ms",
    "peak_memory_mb",
    "proof_json_bytes",
    "public_signals_count"
  ];

  const rows = runs.map((run) =>
    [
      run.run_id,
      run.timestamp,
      run.run_type,
      run.device.model,
      run.device.os,
      run.device.os_version,
      run.circuit.name,
      run.circuit.constraint_count,
      run.circuit.prover_backend,
      run.witness_gen_ms,
      run.proving_ms,
      run.verification_ms,
      run.peak_memory_mb,
      run.proof_json_bytes,
      run.public_signals_count
    ]
      .map(csvCell)
      .join(",")
  );

  return `${[columns.join(","), ...rows].join("\n")}\n`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toMarkdown(runs) {
  const first = runs[0];
  const lines = [
    "# Benchmark summary",
    "",
    `Generated from ${runs.length} run${runs.length === 1 ? "" : "s"}.`,
    "",
    "| Property | Value |",
    "| --- | --- |",
    `| Circuit | ${first.circuit.name} |`,
    `| Constraints | ${first.circuit.constraint_count} |`,
    `| Proof system | ${first.circuit.proof_system} / ${first.circuit.curve} |`,
    `| Prover | ${first.circuit.prover_backend} |`,
    `| Device | ${first.device.model} |`,
    `| OS | ${first.device.os} ${first.device.os_version} |`,
    "",
    "| Stage | Median | Minimum | Maximum |",
    "| --- | ---: | ---: | ---: |"
  ];

  for (const [label, key, places] of [
    ["Witness generation (ms)", "witness_gen_ms", 1],
    ["Proving (ms)", "proving_ms", 1],
    ["Verification (ms)", "verification_ms", 2],
    ["Peak memory (MB)", "peak_memory_mb", 1],
    ["Proof JSON (bytes)", "proof_json_bytes", 0]
  ]) {
    const values = runs.map((run) => run[key]);
    lines.push(
      `| ${label} | ${round(median(values), places)} | ${round(Math.min(...values), places)} | ${round(
        Math.max(...values),
        places
      )} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const runs = readRuns(args.input);
  if (runs.length === 0) {
    throw new Error("no runs found in the selected results");
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  const csvFile = path.join(args.outDir, "results.csv");
  const summaryFile = path.join(args.outDir, "summary.md");
  fs.writeFileSync(csvFile, toCsv(runs));
  fs.writeFileSync(summaryFile, toMarkdown(runs));

  console.log(`wrote ${path.relative(process.cwd(), csvFile)} (${runs.length} rows)`);
  console.log(`wrote ${path.relative(process.cwd(), summaryFile)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
