"use strict";

const state = {
  challenge: null,
  credentials: [],
  testCredentials: [],
  selected: null,
  proof: null,
  health: null,
  proving: false,
  verifying: false,
  submitted: false,
  expired: false,
  testRunning: false,
  receipt: null,
  logs: []
};

const el = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  views: Array.from(document.querySelectorAll(".view")),
  notice: document.getElementById("notice"),
  verifierName: document.getElementById("verifierName"),
  appId: document.getElementById("appId"),
  refDate: document.getElementById("refDate"),
  nonce: document.getElementById("nonce"),
  expires: document.getElementById("expires"),
  credentialList: document.getElementById("credentialList"),
  credentialFile: document.getElementById("credentialFile"),
  credentialMessage: document.getElementById("credentialMessage"),
  credentialDetails: document.getElementById("credentialDetails"),
  proveButton: document.getElementById("proveButton"),
  newChallenge: document.getElementById("newChallenge"),
  newSample: document.getElementById("newSample"),
  statusBadge: document.getElementById("statusBadge"),
  copyReceipt: document.getElementById("copyReceipt"),
  result: document.getElementById("result"),
  resultMark: document.getElementById("resultMark"),
  resultTitle: document.getElementById("result")?.querySelector(".result-title"),
  resultText: document.getElementById("result")?.querySelector(".result-text"),
  proofMeta: document.getElementById("proofMeta"),
  log: document.getElementById("log"),
  clearLog: document.getElementById("clearLog"),
  testRows: document.getElementById("testRows"),
  runAll: document.getElementById("runAll"),
  resetRegistry: document.getElementById("resetRegistry"),
  testSummary: document.getElementById("testSummary"),
  storeMode: document.getElementById("storeMode"),
  healthLine: document.getElementById("healthLine"),
  challengeState: document.getElementById("challengeState"),
  requestBar: document.getElementById("requestBar"),
  journeySteps: Array.from(document.querySelectorAll("[data-journey-step]")),
  receiptDetails: document.getElementById("receiptDetails"),
  receiptPayload: document.getElementById("receiptPayload")
};

let expiryTimer = null;

function setChallengeStatus(message, status) {
  el.challengeState.textContent = message;
  el.requestBar.dataset.state = status;
}

const SCENARIOS = [
  {
    id: "adult",
    name: "KYC complete + 18+",
    note: "Trusted issuer attests KYC completion; holder also meets 18+ rule.",
    expected: "verified",
    expectedLabel: "Verified",
    credential: "adult"
  },
  {
    id: "unverified-kyc",
    name: "KYC incomplete",
    note: "A valid issuer signature cannot turn an incomplete KYC claim into a pass.",
    expected: "proof-failed",
    expectedLabel: "Proof rejected",
    credential: "unverified-kyc"
  },
  {
    id: "expired",
    name: "Expired credential",
    note: "A KYC credential past its signed expiry date must fail.",
    expected: "proof-failed",
    expectedLabel: "Proof rejected",
    credential: "expired"
  },
  {
    id: "minor",
    name: "Underage credential",
    note: "Signature valid, date of birth under the cutoff.",
    expected: "proof-failed",
    expectedLabel: "Proof rejected",
    credential: "minor"
  },
  {
    id: "altered",
    name: "Altered signature",
    note: "Signature changed after the credential was issued.",
    expected: "proof-failed",
    expectedLabel: "Proof rejected",
    credential: "altered"
  },
  {
    id: "untrusted",
    name: "Unrecognized issuer",
    note: "Valid signature under a key the verifier does not trust.",
    expected: "error:UNTRUSTED_ISSUER",
    expectedLabel: "UNTRUSTED_ISSUER",
    credential: "untrusted"
  },
  {
    id: "wrong-app",
    name: "Wrong application",
    note: "Proof generated for a different application id.",
    expected: "error:APP_MISMATCH",
    expectedLabel: "APP_MISMATCH",
    credential: "adult",
    appId: "1"
  },
  {
    id: "wrong-nonce",
    name: "Wrong nonce",
    note: "Proof generated for a different challenge nonce.",
    expected: "error:NONCE_MISMATCH",
    expectedLabel: "NONCE_MISMATCH",
    credential: "adult",
    nonce: "1"
  },
  {
    id: "replay",
    name: "Replay",
    note: "Same proof and token submitted twice.",
    expected: "error:CHALLENGE_USED",
    expectedLabel: "CHALLENGE_USED",
    credential: "adult",
    replay: true
  },
  {
    id: "tampered-signal",
    name: "Tampered public signal",
    note: "Nullifier changed after proof generation.",
    expected: "error:PROOF_INVALID",
    expectedLabel: "PROOF_INVALID",
    credential: "adult",
    tamperSignal: true
  }
];

function short(value, head = 8, tail = 6) {
  const text = String(value);
  if (text.length <= head + tail + 3) {
    return text;
  }
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function formatDate(value) {
  const text = String(value);
  if (!/^\d{8}$/.test(text)) {
    return text;
  }
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return "-";
  }
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function setNotice(message, isError = false) {
  if (!message) {
    el.notice.hidden = true;
    el.notice.textContent = "";
    el.notice.className = "notice";
    return;
  }
  el.notice.hidden = false;
  el.notice.textContent = message;
  el.notice.className = isError ? "notice is-error" : "notice";
}

function setResult(kind, badge, title, text, meta = []) {
  el.copyReceipt.hidden = kind !== "verified";
  el.newSample.hidden =
    !state.selected ||
    state.selected.kind !== "sample" ||
    (kind !== "verified" && !(kind === "rejected" && state.submitted));
  if (kind !== "verified") {
    state.receipt = null;
    el.receiptDetails.hidden = true;
    el.receiptPayload.textContent = "";
  }
  el.result.className = `result${kind ? ` is-${kind}` : ""}`;
  const mark =
    kind === "verified"
      ? "/assets/verified-mark.png"
      : kind === "rejected"
        ? "/assets/review-mark.png"
        : "";
  el.resultMark.hidden = !mark;
  if (mark) {
    el.resultMark.src = mark;
    el.resultMark.alt = kind === "verified" ? "Verification passed" : "Verification rejected";
  } else {
    el.resultMark.alt = "";
  }
  el.statusBadge.className = `badge${kind ? ` is-${kind}` : ""}`;
  el.statusBadge.textContent = badge;

  if (el.resultTitle) {
    el.resultTitle.textContent = title;
  }
  if (el.resultText) {
    el.resultText.textContent = text;
  }

  el.proofMeta.innerHTML = "";
  if (meta.length === 0) {
    el.proofMeta.hidden = true;
    return;
  }

  for (const item of meta) {
    const wrap = document.createElement("div");
    wrap.className = "meta-item";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.label;
    const value = document.createElement("span");
    value.className = "value";
    value.textContent = item.value;
    if (item.title) {
      value.title = item.title;
    }
    wrap.append(label, value);
    el.proofMeta.append(wrap);
  }
  el.proofMeta.hidden = false;
}

function addLog(message) {
  state.logs.push({ at: new Date(), message });
  if (state.logs.length > 30) {
    state.logs.shift();
  }
  renderLog();
}

function renderLog() {
  el.log.innerHTML = "";
  if (state.logs.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No events yet.";
    el.log.append(item);
    return;
  }
  for (const entry of state.logs) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = entry.at.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const text = document.createElement("span");
    text.textContent = entry.message;
    item.append(time, text);
    el.log.append(item);
  }
  el.log.scrollTop = el.log.scrollHeight;
}

function updateButtons() {
  const challengeUsable = Boolean(state.challenge) && !state.expired;
  el.proveButton.disabled =
    !state.selected ||
    !challengeUsable ||
    state.proving ||
    state.verifying ||
    state.testRunning ||
    state.submitted;
  el.proveButton.textContent = state.proving
    ? "Creating proof on this device…"
    : state.verifying
      ? "Checking eligibility…"
      : state.proof && !state.submitted
        ? "Try verification again"
        : "Check eligibility";
  el.newChallenge.disabled = state.proving || state.verifying;
  renderJourney();
}

function renderJourney() {
  const currentStep =
    state.verifying || state.submitted
      ? 3
      : state.proving
        ? 2
        : !state.selected || !state.challenge || state.expired
          ? 1
          : 2;

  for (const item of el.journeySteps) {
    const step = Number(item.dataset.journeyStep);
    item.classList.toggle("is-current", step === currentStep);
    item.classList.toggle("is-complete", step < currentStep);
    if (step === currentStep) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return { error: "BAD_RESPONSE", message: "Server returned a non-JSON response." };
  }
}

async function getChallenge() {
  const response = await fetch("/api/challenge", { headers: { Accept: "application/json" } });
  const body = await readJson(response);
  if (!response.ok) {
    const retryAfter = body && Number(body.retry_after_seconds);
    throw new Error(
      body && body.message
        ? `${body.message}${retryAfter > 0 ? ` Retry in ${retryAfter}s.` : ""}`
        : `Challenge request failed (${response.status}).`
    );
  }
  return body;
}

async function getDemoSample(excludeUid = "") {
  const query = excludeUid ? `?exclude=${excludeUid}` : "";
  const response = await fetch(`/api/demo-sample${query}`, {
    headers: { Accept: "application/json" }
  });
  const body = await readJson(response);
  if (!response.ok || !body || !validCredentialShape(body.credential)) {
    throw new Error(
      body && body.message
        ? body.message
        : "A fresh sample is unavailable. Import a credential instead."
    );
  }
  return body.credential;
}

function renderSession() {
  const challenge = state.challenge;
  if (!challenge) {
    return;
  }

  el.verifierName.textContent = challenge.verifier.app_name;
  el.appId.textContent = short(challenge.challenge.app_id, 10, 6);
  el.appId.title = challenge.challenge.app_id;
  el.refDate.textContent = formatDate(challenge.challenge.ref_date);
  el.nonce.textContent = short(challenge.challenge.nonce, 10, 6);
  el.nonce.title = challenge.challenge.nonce;
}

function startExpiry() {
  if (expiryTimer) {
    clearInterval(expiryTimer);
  }
  const deadline = Date.parse(state.challenge.challenge.expires_at);

  const tick = () => {
    const remaining = Math.max(0, deadline - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    el.expires.textContent = `${minutes}:${rest}`;

    if (remaining <= 0 && !state.expired) {
      state.expired = true;
      el.expires.textContent = "expired";
      setChallengeStatus("Request expired — refresh to continue", "expired");
      updateButtons();
      if (!state.verifying && !state.submitted) {
        setResult(
          "rejected",
          "Expired",
          "Challenge expired",
          "The nonce is no longer valid. Request a new challenge to continue."
        );
      }
      addLog("Challenge expired");
    }
  };

  tick();
  expiryTimer = setInterval(tick, 1000);
}

async function newChallenge() {
  if (state.proving || state.verifying) {
    return;
  }
  el.newChallenge.disabled = true;
  setChallengeStatus("Preparing a secure request…", "pending");
  setNotice("");
  try {
    state.challenge = null;
    state.expired = false;
    state.submitted = false;
    const body = await getChallenge();
    state.challenge = body;
    state.proof = null;
    state.submitted = false;
    state.expired = false;
    renderSession();
    startExpiry();
    setChallengeStatus("Secure request ready", "ready");
    setResult(
      "",
      "Idle",
      "Ready to check",
      "Your browser will create a private proof, then show the verifier’s answer here."
    );
    updateButtons();
    addLog("Challenge issued");
  } catch (error) {
    setNotice(error.message, true);
    setChallengeStatus("Could not prepare a request — try refreshing", "error");
    state.challenge = null;
    updateButtons();
  } finally {
    el.newChallenge.disabled = false;
  }
}

function renderCredentials() {
  el.credentialList.innerHTML = "";
  for (const credential of state.credentials) {
    const label = document.createElement("label");
    label.className = "credential";
    const inputId = `credential-${credential.id}`;
    label.htmlFor = inputId;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "credential";
    input.id = inputId;
    input.value = credential.id;
    input.checked = Boolean(state.selected && state.selected.id === credential.id);
    input.setAttribute(
      "aria-label",
      `${credential.label || "Credential"}: ${credential.description || "Signed credential"}`
    );
    input.addEventListener("change", () => selectCredential(credential));

    const body = document.createElement("span");
    body.className = "credential-body";
    const title = document.createElement("span");
    title.className = "credential-title";
    title.textContent = credential.label || "Imported credential";
    const description = document.createElement("span");
    description.className = "credential-desc";
    description.textContent = credential.description || "Signed credential";
    body.append(title, description);

    const tag = document.createElement("span");
    tag.className = `tag${credential.kind === "imported" ? " tag-imported" : " tag-sample"}`;
    tag.textContent = credential.kind === "imported" ? "Imported" : "Sample";

    label.append(input, body, tag);
    el.credentialList.append(label);
  }
}

function detail(label, value, title) {
  const wrap = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  if (title) {
    dd.title = title;
  }
  wrap.append(dt, dd);
  return wrap;
}

function selectCredential(credential) {
  state.selected = credential;
  state.proof = null;
  state.submitted = false;
  renderCredentials();

  el.credentialDetails.innerHTML = "";
  el.credentialDetails.append(
    detail("Credential UID", short(credential.uid), credential.uid),
    detail("KYC status · local", credential.kyc_verified === "1" ? "Verified" : "Incomplete"),
    detail("Date of birth · local", formatDate(credential.dob)),
    detail("Valid through · local", formatDate(credential.expires_at)),
    detail("Issuer key hash", short(credential.issuer.keyHash), credential.issuer.keyHash),
    detail("Issuer signature", "Present", credential.signature.r8x)
  );

  setResult(
    "",
    "Idle",
    "Ready to check",
    "Your browser will create a private proof, then show the verifier’s answer here."
  );
  updateButtons();
}

function proofInput(credential, challenge, overrides = {}) {
  return {
    dob: credential.dob,
    credential_uid: credential.uid,
    kyc_verified: credential.kyc_verified,
    expires_at: credential.expires_at,
    issuer_ax: credential.issuer.publicKey.x,
    issuer_ay: credential.issuer.publicKey.y,
    signature_r8x: credential.signature.r8x,
    signature_r8y: credential.signature.r8y,
    signature_s: credential.signature.s,
    ref_date: overrides.refDate || challenge.challenge.ref_date,
    app_id: overrides.appId || challenge.challenge.app_id,
    nonce: overrides.nonce || challenge.challenge.nonce,
    issuer_key_hash: credential.issuer.keyHash
  };
}

async function generateProof(credential, challenge, overrides = {}) {
  if (typeof snarkjs === "undefined") {
    throw new Error("The prover library did not load.");
  }
  return snarkjs.groth16.fullProve(
    proofInput(credential, challenge, overrides),
    "/artifacts/age_proof.wasm",
    "/artifacts/age_proof_final.zkey"
  );
}

async function prove() {
  if (!state.selected || !state.challenge || state.proving || state.verifying || state.expired) {
    return;
  }
  if (state.proof && !state.submitted) {
    return submit();
  }
  if (String(state.selected.issuer.keyHash) !== String(state.challenge.verifier.issuer_key_hash)) {
    state.proof = null;
    state.submitted = false;
    setResult(
      "rejected",
      "Untrusted issuer",
      "This issuer is not recognized",
      "The verifier does not trust the issuer that signed this credential. No proof was sent."
    );
    addLog("Credential rejected: issuer is not trusted");
    updateButtons();
    return;
  }

  state.proving = true;
  state.proof = null;
  state.submitted = false;
  setNotice("");
  setResult(
    "working",
    "Working",
    "Generating proof",
    "Building the witness and the Groth16 proof in this tab."
  );
  updateButtons();
  addLog("Proof generation started");

  const started = performance.now();
  try {
    const result = await generateProof(state.selected, state.challenge);
    state.proof = result;
    const elapsed = performance.now() - started;
    setResult(
      "proved",
      "Ready",
      "Proof generated",
      `Submit it to the verifier. Generation took ${formatDuration(elapsed)}.`
    );
    addLog(`Proof generated in ${formatDuration(elapsed)}`);
  } catch (error) {
    setResult(
      "rejected",
      "Rejected",
      "Circuit rejected the credential",
      "No proof was produced. The issuer signature, KYC status, expiry, or age rule did not pass."
    );
    addLog("Proof generation rejected by circuit");
  } finally {
    state.proving = false;
    updateButtons();
  }

  if (state.proof && !state.expired) {
    await submit();
  }
}

async function submit() {
  if (!state.proof || !state.challenge || state.verifying || state.expired || state.submitted) {
    return;
  }

  state.verifying = true;
  setNotice("");
  setResult(
    "working",
    "Working",
    "Checking proof",
    "The verifier is checking the token and the Groth16 proof."
  );
  updateButtons();
  addLog("Proof submitted");

  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        token: state.challenge.token,
        proof: state.proof.proof,
        publicSignals: state.proof.publicSignals
      })
    });
    const body = await readJson(response);

    if (response.ok && body && body.verified) {
      state.submitted = true;
      state.receipt = {
        type: "aegisid-verification-receipt",
        version: 1,
        verified: true,
        policy: body.policy,
        claims: body.claims,
        app_id: body.app_id,
        challenge_id: body.challenge_id,
        ref_date: body.ref_date,
        issuer_key_hash: body.issuer_key_hash,
        issuer_registry: body.issuer_registry,
        nullifier: body.nullifier,
        verify_ms: body.verify_ms,
        verified_at: body.verified_at
      };
      el.copyReceipt.hidden = false;
      setResult(
        "verified",
        "Verified",
        "Eligibility confirmed",
        "The verifier accepted the KYC-complete and 18+ claims. Your source document, birth date, and credential ID stayed on this device.",
        [
          { label: "Claims", value: "KYC complete · 18+" },
          { label: "Nullifier", value: short(body.nullifier, 10, 8), title: body.nullifier },
          { label: "Verification time", value: `${body.verify_ms} ms` },
          { label: "State store", value: body.store },
          { label: "Reference date", value: formatDate(body.ref_date) }
        ]
      );
      el.receiptPayload.textContent = JSON.stringify(state.receipt, null, 2);
      el.receiptDetails.hidden = false;
      addLog(`Verifier accepted proof in ${body.verify_ms} ms`);
    } else {
      state.submitted = true;
      const code = body && body.error ? body.error : `HTTP_${response.status}`;
      const message = body && body.message ? body.message : "Proof was rejected.";
      const retryAfter = body && Number(body.retry_after_seconds);
      const nextStep = {
        CHALLENGE_USED: "Refresh the request and check eligibility again.",
        CHALLENGE_EXPIRED: "Refresh the request to get a new expiry time.",
        CHALLENGE_INVALID: "Refresh the request and try again.",
        DUPLICATE_NULLIFIER:
          "This credential was already used for this app. Try a newly issued credential.",
        UNTRUSTED_ISSUER: "Use a credential issued by an issuer this verifier recognizes.",
        PROOF_INVALID: "Choose another credential or import a valid signed credential.",
        STORE_UNAVAILABLE: "The verifier could not save this result. Wait a moment and try again."
      }[code];
      const duplicateSampleMessage =
        code === "DUPLICATE_NULLIFIER" && state.selected.kind === "sample"
          ? "Another visitor already used this sample. Try a fresh sample below."
          : null;
      setResult(
        "rejected",
        "Not accepted",
        "Proof not accepted",
        duplicateSampleMessage ||
          `${message}${retryAfter > 0 ? ` Try again in ${retryAfter}s.` : ""}${nextStep ? ` ${nextStep}` : ""}`
      );
      addLog(`Verifier rejected proof: ${code}`);
    }
  } catch (error) {
    console.error("verification request error:", error.message || error);
    setNotice("Could not reach the verifier. Check the network and try again.", true);
    addLog("Verification request failed");
  } finally {
    state.verifying = false;
    updateButtons();
  }
}

function setCredentialMessage(message, isError = false) {
  el.credentialMessage.hidden = !message;
  el.credentialMessage.textContent = message;
  el.credentialMessage.className = `import-message${isError ? " is-error" : ""}`;
}

function validCredentialShape(value) {
  const decimal = (item) => typeof item === "string" && /^[0-9]+$/.test(item);
  const date = (item) => {
    if (typeof item !== "string" || !/^\d{8}$/.test(item)) {
      return false;
    }
    const year = Number(item.slice(0, 4));
    const month = Number(item.slice(4, 6));
    const day = Number(item.slice(6, 8));
    const parsed = new Date(0);
    parsed.setUTCHours(0, 0, 0, 0);
    parsed.setUTCFullYear(year, month - 1, day);
    return (
      year >= 1900 &&
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  };
  return Boolean(
    value &&
    typeof value === "object" &&
    value.credentialType === "aegisid.kyc.v1" &&
    date(value.dob) &&
    date(value.expires_at) &&
    decimal(value.uid) &&
    (value.kyc_verified === "0" || value.kyc_verified === "1") &&
    value.issuer &&
    decimal(value.issuer.keyHash) &&
    value.issuer.publicKey &&
    decimal(value.issuer.publicKey.x) &&
    decimal(value.issuer.publicKey.y) &&
    value.signature &&
    decimal(value.signature.r8x) &&
    decimal(value.signature.r8y) &&
    decimal(value.signature.s)
  );
}

async function importCredential(file) {
  if (!file) {
    return;
  }
  try {
    if (file.size > 512 * 1024) {
      throw new Error("Credential files must be smaller than 512 KB.");
    }
    const parsed = JSON.parse(await file.text());
    const candidates = Array.isArray(parsed && parsed.credentials)
      ? parsed.credentials
      : [parsed && parsed.credential ? parsed.credential : parsed];
    const accepted = candidates.filter(validCredentialShape);
    if (accepted.length === 0) {
      throw new Error("This file does not match the AegisID signed credential format.");
    }
    const imported = accepted.map((credential, index) => ({
      ...credential,
      id: `import-${Date.now()}-${index}`,
      label: accepted.length === 1 ? "Imported credential" : `Imported credential ${index + 1}`,
      description: "Selected from this device · never uploaded",
      kind: "imported"
    }));
    state.credentials = [
      ...imported,
      ...state.credentials.filter((item) => !item.id.startsWith("import-"))
    ];
    renderCredentials();
    selectCredential(imported[0]);
    setCredentialMessage(
      `${imported.length} credential${imported.length === 1 ? "" : "s"} loaded locally. The file is never uploaded.`
    );
    addLog(`${imported.length} credential${imported.length === 1 ? "" : "s"} imported locally`);
  } catch (error) {
    setCredentialMessage(error.message || "Could not read that credential file.", true);
  } finally {
    el.credentialFile.value = "";
  }
}

function credentialFor(id) {
  return (
    state.testCredentials.find((credential) => credential.id === id) ||
    state.credentials.find((credential) => credential.id === id) ||
    null
  );
}

async function useAnotherSample() {
  if (state.proving || state.verifying) {
    return;
  }
  el.newSample.disabled = true;
  try {
    const sample = await getDemoSample(state.selected && state.selected.uid);
    state.credentials = [sample, ...state.credentials.filter((item) => item.kind === "imported")];
    renderCredentials();
    selectCredential(sample);
    await newChallenge();
    if (!state.challenge) {
      setCredentialMessage("Fresh sample selected. Refresh the request before checking it.", true);
      return;
    }
    setCredentialMessage("Fresh synthetic sample ready. Check eligibility to run the demo again.");
    addLog("Fresh demo sample selected");
  } catch (error) {
    setCredentialMessage(error.message || "A fresh sample is unavailable.", true);
  } finally {
    el.newSample.disabled = false;
  }
}

function renderTests() {
  el.testRows.innerHTML = "";
  for (const scenario of SCENARIOS) {
    const row = document.createElement("tr");
    row.dataset.scenario = scenario.id;

    const nameCell = document.createElement("th");
    nameCell.scope = "row";
    const name = document.createElement("span");
    name.className = "test-name";
    name.textContent = scenario.name;
    const note = document.createElement("span");
    note.className = "test-note";
    note.textContent = scenario.note;
    nameCell.append(name, note);

    const expectedCell = document.createElement("td");
    expectedCell.className = "mono";
    expectedCell.textContent = scenario.expectedLabel;

    const resultCell = document.createElement("td");
    resultCell.className = "result-muted";
    resultCell.textContent = "Not run";

    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-secondary button-small";
    button.textContent = "Run";
    button.setAttribute("aria-label", `Run ${scenario.name} test`);
    button.disabled = !(state.health && state.health.demo_mode);
    button.title = button.disabled ? "Available only in demo mode" : `Run ${scenario.name}`;
    button.addEventListener("click", () => runScenario(scenario));
    actionCell.append(button);

    row.append(nameCell, expectedCell, resultCell, actionCell);
    el.testRows.append(row);
  }
}

function updateTestSummary() {
  const rows = Array.from(el.testRows.querySelectorAll("tr"));
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const row of rows) {
    const cell = row.querySelector("td:nth-child(3)");
    if (cell && cell.dataset.status === "pass") {
      passed += 1;
    } else if (cell && cell.dataset.status === "fail") {
      failed += 1;
    } else {
      pending += 1;
    }
  }
  el.testSummary.textContent =
    passed + failed === 0
      ? state.health && !state.health.demo_mode
        ? "Case runs are disabled on the production verifier."
        : "No cases run."
      : `${passed} passed, ${failed} failed, ${pending} not run.`;
}

function setRowResult(scenario, status, text) {
  const row = el.testRows.querySelector(`tr[data-scenario="${scenario.id}"]`);
  if (!row) {
    return;
  }
  const cell = row.querySelector("td:nth-child(3)");
  cell.dataset.status = status;
  cell.className =
    status === "pass"
      ? "result-pass"
      : status === "fail"
        ? "result-fail"
        : status === "run"
          ? "result-run"
          : "result-muted";
  cell.textContent = text;
  updateTestSummary();
}

function setTestButtonsDisabled(disabled) {
  for (const button of el.testRows.querySelectorAll("button")) {
    button.disabled = disabled || !(state.health && state.health.demo_mode);
  }
  el.runAll.disabled = disabled || !(state.health && state.health.demo_mode);
  el.resetRegistry.disabled = disabled;
  updateButtons();
}

async function resetRegistry(logEvent = true) {
  const response = await fetch("/api/reset", {
    method: "POST",
    headers: { Accept: "application/json" }
  });
  const body = await readJson(response);
  if (!response.ok) {
    if (response.status === 404) {
      return false;
    }
    throw new Error(body && body.message ? body.message : "Reset failed.");
  }
  if (logEvent) {
    addLog("Nullifier registry cleared");
  }
  return true;
}

async function runScenario(scenario) {
  if (state.testRunning || state.proving) {
    return;
  }
  state.testRunning = true;
  setTestButtonsDisabled(true);
  setRowResult(scenario, "run", "Running");
  setNotice("");

  const credential = credentialFor(scenario.credential);
  if (!credential) {
    setRowResult(scenario, "fail", "Missing credential");
    state.testRunning = false;
    setTestButtonsDisabled(false);
    return;
  }

  try {
    if (state.health && state.health.demo_mode) {
      await resetRegistry(false);
    }

    const challenge = await getChallenge();
    let proof = null;
    try {
      proof = await generateProof(credential, challenge, {
        appId: scenario.appId,
        nonce: scenario.nonce
      });
    } catch (error) {
      if (scenario.expected === "proof-failed") {
        setRowResult(scenario, "pass", "Pass (circuit rejected)");
      } else {
        setRowResult(scenario, "fail", "Proof generation failed");
      }
      state.testRunning = false;
      setTestButtonsDisabled(false);
      return;
    }

    if (scenario.expected === "proof-failed") {
      setRowResult(scenario, "fail", "Proof was generated");
      state.testRunning = false;
      setTestButtonsDisabled(false);
      return;
    }

    if (scenario.tamperSignal) {
      proof.publicSignals[0] = (BigInt(proof.publicSignals[0]) + 1n).toString();
    }

    const submitOnce = async () => {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          token: challenge.token,
          proof: proof.proof,
          publicSignals: proof.publicSignals
        })
      });
      return { response, body: await readJson(response) };
    };

    if (scenario.replay) {
      const first = await submitOnce();
      if (!(first.response.ok && first.body && first.body.verified)) {
        setRowResult(scenario, "fail", "First submission was not verified");
        state.testRunning = false;
        setTestButtonsDisabled(false);
        return;
      }
      const second = await submitOnce();
      const code = second.body && second.body.error;
      if (second.response.status === 409 && code === "CHALLENGE_USED") {
        setRowResult(scenario, "pass", "Pass (CHALLENGE_USED)");
      } else {
        setRowResult(
          scenario,
          "fail",
          `Expected CHALLENGE_USED, got ${code || second.response.status}`
        );
      }
      state.testRunning = false;
      setTestButtonsDisabled(false);
      return;
    }

    const { response, body } = await submitOnce();
    if (scenario.expected === "verified") {
      if (response.ok && body && body.verified) {
        setRowResult(scenario, "pass", "Pass (verified)");
      } else {
        setRowResult(scenario, "fail", `Expected verified, got ${body && body.error}`);
      }
    } else if (scenario.expected.startsWith("error:")) {
      const expectedCode = scenario.expected.slice("error:".length);
      if (body && body.error === expectedCode) {
        setRowResult(scenario, "pass", `Pass (${expectedCode})`);
      } else {
        setRowResult(scenario, "fail", `Expected ${expectedCode}, got ${body && body.error}`);
      }
    }
  } catch (error) {
    console.error(`scenario ${scenario.id} error:`, error.message || error);
    setRowResult(scenario, "fail", error.message);
  } finally {
    state.testRunning = false;
    setTestButtonsDisabled(false);
  }
}

async function runAll() {
  if (state.testRunning) {
    return;
  }
  if (!state.health || !state.health.demo_mode) {
    setNotice(
      "Run all needs AEGIS_DEMO=1 so every case starts from a clean nullifier registry.",
      true
    );
    return;
  }
  for (const row of el.testRows.querySelectorAll("tr")) {
    setRowResult({ id: row.dataset.scenario }, "pending", "Not run");
  }
  for (const scenario of SCENARIOS) {
    await runScenario(scenario);
  }
}

function switchView(name) {
  for (const tab of el.tabs) {
    const active = tab.dataset.view === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
  }
  for (const view of el.views) {
    const active = view.id === `view-${name}`;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  }
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health", { headers: { Accept: "application/json" } });
    const body = await readJson(response);
    if (!response.ok) {
      throw new Error("Health check failed.");
    }
    state.health = body;
    el.healthLine.textContent = body.ok
      ? `ready - ${body.store} state · issuer ${body.issuer_registry}`
      : "not ready";
    el.storeMode.textContent = `state: ${body.store} · issuer: ${body.issuer_registry}`;
    el.resetRegistry.hidden = !body.demo_mode;
    el.runAll.disabled = !body.demo_mode;
    el.runAll.title = body.demo_mode ? "" : "Requires AEGIS_DEMO=1";
    if (!body.demo_mode) {
      el.testSummary.textContent = "Case runs are disabled on the production verifier.";
    }
    if (!body.ok) {
      setNotice("The verifier is not configured. Check /api/health for details.", true);
    }
  } catch (error) {
    el.healthLine.textContent = "status unavailable";
    setNotice("Could not read verifier status.", true);
  }
}

async function loadCredentials() {
  const response = await fetch("/credentials.json", { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error("Could not load demo credentials.");
  }
  const body = await response.json();
  state.testCredentials = Array.isArray(body.credentials) ? body.credentials : [];
  try {
    const sample = await getDemoSample();
    state.credentials = [sample];
  } catch (error) {
    state.credentials = [];
    state.selected = null;
    setCredentialMessage(
      "No fresh sample is available. Import a compatible signed credential to continue.",
      true
    );
  }
}

function bindEvents() {
  for (const tab of el.tabs) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  }
  const tabList = document.querySelector(".tabs");
  if (tabList) {
    tabList.addEventListener("keydown", (event) => {
      if (
        event.key !== "ArrowRight" &&
        event.key !== "ArrowLeft" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }
      event.preventDefault();
      if (event.key === "Home") {
        const firstTab = el.tabs[0];
        if (firstTab) {
          firstTab.focus();
          switchView(firstTab.dataset.view);
        }
        return;
      }
      if (event.key === "End") {
        const lastTab = el.tabs[el.tabs.length - 1];
        if (lastTab) {
          lastTab.focus();
          switchView(lastTab.dataset.view);
        }
        return;
      }
      const currentIndex = el.tabs.findIndex((t) => t.classList.contains("is-active"));
      if (currentIndex === -1) {
        return;
      }
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (currentIndex + direction + el.tabs.length) % el.tabs.length;
      const nextTab = el.tabs[nextIndex];
      nextTab.focus();
      switchView(nextTab.dataset.view);
    });
  }
  for (const step of el.journeySteps) {
    const action = step.querySelector(".journey-action");
    if (action) {
      action.addEventListener("click", () => {
        const targetId = action.dataset.journeyTarget;
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
          if (target.tabIndex < 0) {
            target.tabIndex = -1;
          }
          target.focus({ preventScroll: true });
        }
      });
    }
  }
  el.newChallenge.addEventListener("click", newChallenge);
  el.newSample.addEventListener("click", useAnotherSample);
  el.proveButton.addEventListener("click", prove);
  el.copyReceipt.addEventListener("click", async () => {
    if (!state.receipt) {
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.receipt, null, 2));
      setNotice(
        "Verification receipt copied. It contains no date of birth or credential identifier."
      );
    } catch (error) {
      setNotice(
        "Clipboard access is unavailable. Open “View receipt JSON” below and copy it manually.",
        true
      );
    }
  });
  el.credentialFile.addEventListener("change", (event) => importCredential(event.target.files[0]));
  el.clearLog.addEventListener("click", () => {
    state.logs = [];
    renderLog();
  });
  el.runAll.addEventListener("click", runAll);
  el.resetRegistry.addEventListener("click", async () => {
    try {
      const reset = await resetRegistry(true);
      if (!reset) {
        setNotice("Reset is disabled on this deployment.", true);
      } else {
        setNotice("Nullifier registry cleared.");
      }
    } catch (error) {
      setNotice(error.message, true);
    }
  });
}

async function init() {
  bindEvents();
  renderLog();
  updateButtons();

  try {
    await Promise.all([loadHealth(), loadCredentials()]);
    renderCredentials();
    renderTests();
    updateTestSummary();
    updateButtons();
    await newChallenge();
  } catch (error) {
    console.error("initialization error:", error.message || error);
    setNotice(error.message, true);
  }
}

init();
