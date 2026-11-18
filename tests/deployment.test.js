"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const snarkjs = require("snarkjs");
const securityHeaders = require("../config/security-headers.json");
const vercel = require("../vercel.json");
const { root, verificationKey } = require("./helpers");

const appDir = path.join(root, "app");
const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");

test("Vercel and the local server send identical security headers", () => {
  const global = vercel.headers.find(({ source }) => source === "/(.*)");
  assert.deepEqual(global.headers, securityHeaders);
});

test("the content security policy forbids inline code and third-party origins", () => {
  const policy = securityHeaders.find(({ key }) => key === "Content-Security-Policy").value;
  assert.doesNotMatch(policy, /'unsafe-inline'|'unsafe-eval'|https?:/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=/);
});

test("every local asset referenced by the page exists", () => {
  const references = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
    .map(([, reference]) => reference)
    .filter((reference) => reference !== "/" && !reference.startsWith("/api/"));
  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.ok(fs.existsSync(path.join(appDir, reference)), reference);
  }
});

test("page landmarks and language support assistive technology", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /id="liveStatus"[^>]*role="status"/);
  for (const [image] of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(image, /\salt="/);
  }
});

test("the published proving key matches the committed verification key", async () => {
  const zkey = path.join(appDir, "artifacts", "age_proof_final.zkey");
  const derived = await snarkjs.zKey.exportVerificationKey(zkey);
  assert.deepEqual(JSON.parse(JSON.stringify(derived)), verificationKey);
});

test("the problem map separates demonstrated work from future scope", () => {
  assert.equal(html.match(/>Shown in this demo</g)?.length, 2);
  assert.equal(html.match(/>Needs a regulated issuer</g)?.length, 2);
  assert.equal(html.match(/>Future claim, not built</g)?.length, 2);
});
