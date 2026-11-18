#!/usr/bin/env node
"use strict";

// Creates the demo issuer key, writes the trusted-key config, and signs
// acceptance fixtures plus a finite pool of public synthetic samples. The
// key file is local-only; the public config and credentials are safe to publish.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { buildEddsa, buildPoseidon } = require("circomlibjs");

const root = path.join(__dirname, "..");
const keyFile = path.join(__dirname, "keypair.json");
const configDir = path.join(root, "config");
const configFile = path.join(configDir, "issuer.json");
const appDir = path.join(root, "app");
const credentialsFile = path.join(appDir, "credentials.json");
const demoSamplesFile = path.join(configDir, "demo-samples.json");
const demoSampleCount = 1024;

const rotate = process.argv.includes("--rotate");

function writeJson(file, value, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, mode ? { mode } : undefined);
}

function publicFromPrivate(eddsa, privateHex) {
  const point = eddsa.prv2pub(Buffer.from(privateHex, "hex"));
  return {
    x: eddsa.F.toString(point[0]),
    y: eddsa.F.toString(point[1])
  };
}

async function main() {
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  let keypair;
  if (!rotate && fs.existsSync(keyFile)) {
    keypair = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    if (!keypair.privateKey || !keypair.publicKey) {
      throw new Error("issuer/keypair.json is incomplete; rerun with --rotate");
    }
    const derived = publicFromPrivate(eddsa, keypair.privateKey);
    if (derived.x !== keypair.publicKey.x || derived.y !== keypair.publicKey.y) {
      throw new Error("issuer/keypair.json does not match its private key; rerun with --rotate");
    }
    console.log("using existing issuer key");
  } else {
    const privateKey = crypto.randomBytes(32).toString("hex");
    const publicKey = publicFromPrivate(eddsa, privateKey);
    keypair = {
      version: 1,
      algorithm: "EdDSA-Poseidon",
      curve: "BabyJubjub",
      privateKey,
      publicKey,
      createdAt: new Date().toISOString()
    };
    writeJson(keyFile, keypair, 0o600);
    console.log("created issuer/keypair.json");
  }

  const trustedKeyHash = F.toString(
    poseidon([BigInt(keypair.publicKey.x), BigInt(keypair.publicKey.y)])
  );

  writeJson(configFile, {
    version: 1,
    algorithm: "EdDSA-Poseidon",
    curve: "BabyJubjub",
    publicKey: keypair.publicKey,
    keyHash: trustedKeyHash,
    createdAt: keypair.createdAt
  });

  // A second key is used only to build the "unrecognized issuer" fixture.
  const roguePrivate = crypto.randomBytes(32).toString("hex");
  const roguePublic = publicFromPrivate(eddsa, roguePrivate);
  const rogueKeyHash = F.toString(poseidon([BigInt(roguePublic.x), BigInt(roguePublic.y)]));

  const sign = (privateHex, dob, uid) => {
    const privateKey = Buffer.from(privateHex, "hex");
    const message = poseidon([BigInt(dob), BigInt(uid)]);
    const signature = eddsa.signPoseidon(privateKey, message);
    return {
      r8x: eddsa.F.toString(signature.R8[0]),
      r8y: eddsa.F.toString(signature.R8[1]),
      s: signature.S.toString()
    };
  };

  const newUid = () => BigInt(`0x${crypto.randomBytes(16).toString("hex")}`).toString();
  const issuedAt = new Date().toISOString();

  const adultUid = newUid();
  const adultDob = "20010514";
  const adultSignature = sign(keypair.privateKey, adultDob, adultUid);

  const minorUid = newUid();
  const minorDob = "20100820";

  const untrustedUid = newUid();

  const credentials = [
    {
      id: "adult",
      label: "Adult credential",
      description: "Valid issuer signature. Date of birth is 18 years or more before today.",
      kind: "valid",
      dob: adultDob,
      uid: adultUid,
      issuedAt,
      issuer: { keyHash: trustedKeyHash, publicKey: keypair.publicKey },
      signature: adultSignature
    },
    {
      id: "minor",
      label: "Minor credential",
      description: "Valid issuer signature. Date of birth is under 18 years before today.",
      kind: "valid",
      dob: minorDob,
      uid: minorUid,
      issuedAt,
      issuer: { keyHash: trustedKeyHash, publicKey: keypair.publicKey },
      signature: sign(keypair.privateKey, minorDob, minorUid)
    },
    {
      id: "altered",
      label: "Altered credential",
      description: "Issuer signature changed after issuance. The circuit must reject it.",
      kind: "invalid",
      dob: adultDob,
      uid: adultUid,
      issuedAt,
      issuer: { keyHash: trustedKeyHash, publicKey: keypair.publicKey },
      signature: {
        ...adultSignature,
        s: (BigInt(adultSignature.s) + 1n).toString()
      }
    },
    {
      id: "untrusted",
      label: "Unrecognized issuer",
      description: "Signed by a key that is not on the verifier's trusted list.",
      kind: "invalid",
      dob: adultDob,
      uid: untrustedUid,
      issuedAt,
      issuer: { keyHash: rogueKeyHash, publicKey: roguePublic },
      signature: sign(roguePrivate, adultDob, untrustedUid)
    }
  ];

  writeJson(credentialsFile, {
    version: 1,
    generatedAt: new Date().toISOString(),
    issuerKeyHash: trustedKeyHash,
    note: "Synthetic demo credentials. They are public by design; a real wallet would keep them local.",
    credentials
  });

  const demoSamples = Array.from({ length: demoSampleCount }, (_, index) => {
    const uid = newUid();
    return {
      id: `public-sample-${index + 1}`,
      label: "Sample adult credential",
      description: "Synthetic example. It can be verified once by this app.",
      kind: "sample",
      dob: adultDob,
      uid,
      issuedAt,
      signature: sign(keypair.privateKey, adultDob, uid)
    };
  });

  writeJson(demoSamplesFile, {
    version: 1,
    generatedAt: new Date().toISOString(),
    issuerKeyHash: trustedKeyHash,
    issuer: { keyHash: trustedKeyHash, publicKey: keypair.publicKey },
    note: "Public synthetic fixtures for the demo. Each fixture has a unique credential UID.",
    credentials: demoSamples
  });

  console.log(`trusted issuer key hash: ${trustedKeyHash}`);
  console.log(
    `wrote issuer config, ${credentials.length} acceptance fixtures, and ${demoSamples.length} public demo samples`
  );
  console.log("run npm run build:circuits if the circuit changed");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
