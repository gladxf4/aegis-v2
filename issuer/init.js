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
const DEMO_SAMPLE_COUNT = 1024;
const ADULT_DOB = "20010514";
const MINOR_DOB = "20100820";
const DEFAULT_EXPIRY = "20301231";
const PAST_EXPIRY = "20200101";

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

  const sign = (privateHex, dob, uid, kycVerified, expiresAt) => {
    const privateKey = Buffer.from(privateHex, "hex");
    const message = poseidon([BigInt(dob), BigInt(uid), BigInt(kycVerified), BigInt(expiresAt)]);
    const signature = eddsa.signPoseidon(privateKey, message);
    return {
      r8x: eddsa.F.toString(signature.R8[0]),
      r8y: eddsa.F.toString(signature.R8[1]),
      s: signature.S.toString()
    };
  };

  const newUid = () => BigInt(`0x${crypto.randomBytes(16).toString("hex")}`).toString();
  const issuedAt = new Date().toISOString();
  const trustedIssuer = { keyHash: trustedKeyHash, publicKey: keypair.publicKey };
  const rogueIssuer = { keyHash: rogueKeyHash, publicKey: roguePublic };

  const issue = ({
    dob = ADULT_DOB,
    uid = newUid(),
    kycVerified = "1",
    expiresAt = DEFAULT_EXPIRY,
    issuer = trustedIssuer,
    signingKey = keypair.privateKey,
    ...presentation
  }) => ({
    ...presentation,
    dob,
    uid,
    kyc_verified: kycVerified,
    expires_at: expiresAt,
    issuedAt,
    issuer,
    signature: sign(signingKey, dob, uid, kycVerified, expiresAt),
    credentialType: "aegisid.kyc.v1"
  });

  const adult = issue({
    id: "adult",
    label: "Synthetic KYC credential",
    description: "Issuer attests KYC completion; the credential proves 18+ until expiry.",
    kind: "valid"
  });

  const credentials = [
    adult,
    issue({
      id: "minor",
      label: "Synthetic minor credential",
      description: "Valid KYC attestation, but the age claim is under 18.",
      kind: "valid",
      dob: MINOR_DOB
    }),
    {
      ...adult,
      id: "altered",
      label: "Altered KYC credential",
      description: "Issuer signature changed after issuance. The circuit must reject it.",
      kind: "invalid",
      signature: { ...adult.signature, s: (BigInt(adult.signature.s) + 1n).toString() }
    },
    issue({
      id: "untrusted",
      label: "Unrecognized KYC issuer",
      description: "Signed by a key that is not on the verifier's trusted list.",
      kind: "invalid",
      issuer: rogueIssuer,
      signingKey: roguePrivate
    }),
    issue({
      id: "unverified-kyc",
      label: "KYC not completed",
      description: "Signed credential with no completed KYC attestation.",
      kind: "invalid",
      kycVerified: "0"
    }),
    issue({
      id: "expired",
      label: "Expired KYC credential",
      description: "Signed KYC credential whose validity ended before the request date.",
      kind: "invalid",
      expiresAt: PAST_EXPIRY
    })
  ];

  writeJson(credentialsFile, {
    version: 1,
    generatedAt: new Date().toISOString(),
    issuerKeyHash: trustedKeyHash,
    note: "Synthetic demo credentials. They are public by design; a real wallet would keep them local.",
    credentials
  });

  const demoSamples = Array.from({ length: DEMO_SAMPLE_COUNT }, (_, index) => {
    const { issuer, ...sample } = issue({
      id: `public-sample-${index + 1}`,
      label: "Synthetic KYC credential",
      description: "Synthetic KYC-complete credential. It can be proved once per app.",
      kind: "sample"
    });
    return sample;
  });

  writeJson(demoSamplesFile, {
    version: 1,
    generatedAt: new Date().toISOString(),
    issuerKeyHash: trustedKeyHash,
    issuer: trustedIssuer,
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
