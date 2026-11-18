#!/usr/bin/env node
"use strict";

// Copies the compiled circuit and the snarkjs browser bundle into the
// static app. Vercel runs this before publishing. If the files are already
// present (the normal case for a deployment from this repository), it only
// checks them.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(root, "circuits", "build");
const app = path.join(root, "app");
const artifacts = path.join(app, "artifacts");
const vendor = path.join(app, "vendor");

const copies = [
  {
    from: path.join(build, "age_proof_js", "age_proof.wasm"),
    to: path.join(artifacts, "age_proof.wasm"),
    required: true
  },
  {
    from: path.join(build, "age_proof_final.zkey"),
    to: path.join(artifacts, "age_proof_final.zkey"),
    required: true
  },
  {
    from: path.join(root, "node_modules", "snarkjs", "build", "snarkjs.min.js"),
    to: path.join(vendor, "snarkjs.min.js"),
    required: true
  },
  {
    from: path.join(root, "node_modules", "snarkjs", "COPYING"),
    to: path.join(vendor, "snarkjs.COPYING"),
    required: false
  }
];

fs.mkdirSync(artifacts, { recursive: true });
fs.mkdirSync(vendor, { recursive: true });

let copied = 0;
for (const item of copies) {
  if (fs.existsSync(item.from)) {
    fs.copyFileSync(item.from, item.to);
    copied += 1;
    continue;
  }
  if (!fs.existsSync(item.to)) {
    if (item.required) {
      console.error(`missing ${path.relative(root, item.from)}`);
      console.error("run npm run build:circuits first, or commit the generated artifact");
      process.exit(1);
    }
  }
}

for (const file of ["config/issuer.json", "config/demo-samples.json", "app/credentials.json"]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error(`missing ${file}`);
    console.error("run npm run issuer:init first");
    process.exit(1);
  }
}

const vkey = path.join(build, "age_proof_verification_key.json");
if (!fs.existsSync(vkey)) {
  console.error("missing circuits/build/age_proof_verification_key.json");
  console.error("run npm run build:circuits first");
  process.exit(1);
}

const size = (p) => `${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB`;
console.log(
  `web assets ready (${copied} copied, ` +
    `wasm ${size(path.join(artifacts, "age_proof.wasm"))}, ` +
    `zkey ${size(path.join(artifacts, "age_proof_final.zkey"))})`
);
