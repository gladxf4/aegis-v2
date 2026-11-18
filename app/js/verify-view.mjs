import { fetchChallenge, fetchDemoSample, submitProof } from "./api.mjs";
import {
  buildProofInput,
  MAX_CREDENTIAL_FILE_BYTES,
  parseCredentialDocument
} from "./credential.mjs";
import { formatCompactDate, formatCountdown, formatDuration, shortenMiddle } from "./format.mjs";
import { buildReceipt, describeRejection, isRetryableRejection } from "./outcome.mjs";
import { CircuitRejection, generateProof } from "./prover.mjs";
import { isBusy, state } from "./state.mjs";
import { addLog, announce, byId, createElement, setNotice } from "./ui.mjs";

// A proof can take several seconds on a phone, so it starts with time to spare.
const MIN_CHALLENGE_LIFETIME_MS = 45_000;
const READY_TEXT =
  "Your browser will create a private proof, then show the verifier’s answer here.";
const RESULT_MARKS = {
  verified: { src: "/assets/verified-mark.png", alt: "Verification passed" },
  rejected: { src: "/assets/review-mark.png", alt: "Verification rejected" }
};

let expiryTimer = null;

const challengeDeadline = () => Date.parse(state.session.challenge.expires_at);

function setRequestStatus(message, status) {
  byId("challengeState").textContent = message;
  byId("requestBar").dataset.state = status;
}

function renderMeta(items) {
  const meta = byId("proofMeta");
  meta.hidden = items.length === 0;
  meta.replaceChildren(
    ...items.map(({ label, value, title = "" }) =>
      createElement(
        "div",
        { className: "meta-item" },
        createElement("span", { className: "label" }, label),
        createElement("span", { className: "value", title }, value)
      )
    )
  );
}

function renderReceipt() {
  byId("copyReceipt").hidden = !state.receipt;
  byId("receiptDetails").hidden = !state.receipt;
  byId("receiptPayload").textContent = state.receipt ? JSON.stringify(state.receipt, null, 2) : "";
}

/** Renders the result panel. Final results also move focus to their heading. */
function showResult({ kind = "", badge, title, text, meta = [], final = false }) {
  if (kind !== "verified") {
    state.receipt = null;
  }
  renderReceipt();
  byId("newSample").hidden = !(state.selected?.kind === "sample" && state.submitted);

  const mark = RESULT_MARKS[kind];
  const markImage = byId("resultMark");
  markImage.hidden = !mark;
  markImage.alt = mark?.alt ?? "";
  if (mark) {
    markImage.src = mark.src;
  }

  byId("result").className = kind ? `result is-${kind}` : "result";
  byId("statusBadge").className = kind ? `badge is-${kind}` : "badge";
  byId("statusBadge").textContent = badge;
  byId("resultTitle").textContent = title;
  byId("resultText").textContent = text;
  byId("resultPanel").setAttribute("aria-busy", String(kind === "working"));
  renderMeta(meta);
  announce(`${title}. ${text}`);
  if (final) {
    byId("resultTitle").focus();
  }
}

function showReady() {
  showResult({ badge: "Idle", title: "Ready to check", text: READY_TEXT });
}

function proveButtonLabel() {
  if (state.phase === "proving") {
    return "Creating proof on this device…";
  }
  if (state.phase === "verifying") {
    return "Checking eligibility…";
  }
  return state.proof ? "Try verification again" : "Check eligibility";
}

function currentJourneyStep() {
  if (state.phase === "verifying" || state.submitted) {
    return 3;
  }
  return state.selected && state.session ? 2 : 1;
}

function renderJourney() {
  const currentStep = currentJourneyStep();
  for (const item of document.querySelectorAll("[data-journey-step]")) {
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

function proveHint() {
  if (!state.selected) {
    return "Choose or import a credential to continue.";
  }
  if (state.submitted) {
    return "This credential has a result. Choose another credential or sample to check again.";
  }
  return "";
}

/** Synchronizes controls with the current state. */
export function renderControls() {
  const button = byId("proveButton");
  const hint = proveHint();
  button.disabled = !state.selected || !state.session || state.submitted || isBusy();
  button.textContent = proveButtonLabel();
  byId("proveHint").textContent = hint;
  byId("proveHint").hidden = !hint;
  byId("newChallenge").disabled = isBusy();
  renderJourney();
}

function renderSession() {
  const { challenge, verifier } = state.session;
  byId("verifierName").textContent = verifier.app_name;
  byId("appId").textContent = shortenMiddle(challenge.app_id, 10, 6);
  byId("appId").title = challenge.app_id;
  byId("refDate").textContent = formatCompactDate(challenge.ref_date);
  byId("nonce").textContent = shortenMiddle(challenge.nonce, 10, 6);
  byId("nonce").title = challenge.nonce;
}

function stopExpiryTimer() {
  clearInterval(expiryTimer);
  expiryTimer = null;
}

function markChallengeSpent() {
  state.challengeSpent = true;
  stopExpiryTimer();
  byId("expires").textContent = "refresh to check again";
  setRequestStatus("Request used", "expired");
}

function handleExpiry() {
  stopExpiryTimer();
  byId("expires").textContent = "expired";
  addLog("Challenge expired");
  if (isBusy()) {
    setRequestStatus("Request expired", "expired");
    return;
  }
  // Renewing automatically means no one has to race the timer (WCAG 2.2.1).
  loadChallenge();
}

function startExpiryTimer() {
  stopExpiryTimer();
  const tick = () => {
    const remaining = challengeDeadline() - Date.now();
    byId("expires").textContent = formatCountdown(remaining);
    if (remaining <= 0) {
      handleExpiry();
    }
  };
  expiryTimer = setInterval(tick, 1000);
  tick();
}

/** @returns {Promise<boolean>} True when a usable challenge was loaded */
async function loadChallenge() {
  setRequestStatus("Preparing a secure request…", "pending");
  byId("newChallenge").disabled = true;
  state.session = null;
  state.proof = null;
  state.challengeSpent = false;
  renderControls();
  try {
    state.session = await fetchChallenge();
    renderSession();
    startExpiryTimer();
    setRequestStatus("Secure request ready", "ready");
    addLog("Challenge issued");
    return true;
  } catch (error) {
    stopExpiryTimer();
    byId("expires").textContent = "-";
    setRequestStatus("Could not prepare a request. Refresh to try again.", "error");
    setNotice(error.message, true);
    return false;
  } finally {
    renderControls();
  }
}

async function ensureFreshChallenge() {
  const usable =
    state.session &&
    !state.challengeSpent &&
    challengeDeadline() - Date.now() > MIN_CHALLENGE_LIFETIME_MS;
  return usable || loadChallenge();
}

function showVerified(result) {
  state.submitted = true;
  state.receipt = buildReceipt(result);
  showResult({
    kind: "verified",
    badge: "Verified",
    title: "Eligibility confirmed",
    text: "The verifier accepted the KYC-complete and 18+ claims. Your source document, birth date, and credential ID stayed on this device.",
    meta: [
      { label: "Claims", value: "KYC complete · 18+" },
      {
        label: "Nullifier",
        value: shortenMiddle(result.nullifier, 10, 8),
        title: result.nullifier
      },
      { label: "Verification time", value: `${result.verify_ms} ms` },
      { label: "State store", value: result.store },
      { label: "Reference date", value: formatCompactDate(result.ref_date) }
    ],
    final: true
  });
  addLog(`Verifier accepted proof in ${result.verify_ms} ms`);
}

function showRejected(response) {
  const { code, text } = describeRejection(response, state.selected.kind);
  const retryable = isRetryableRejection(code);
  state.submitted = !retryable;
  if (!retryable) {
    state.proof = null;
    markChallengeSpent();
  }
  showResult({
    kind: "rejected",
    badge: "Not accepted",
    title: "Proof not accepted",
    text,
    final: true
  });
  addLog(`Verifier rejected proof: ${code}`);
}

async function submitCurrentProof() {
  state.phase = "verifying";
  setNotice("");
  showResult({
    kind: "working",
    badge: "Working",
    title: "Checking proof",
    text: "The verifier is checking the request and the proof."
  });
  renderControls();
  addLog("Proof submitted");

  try {
    const response = await submitProof(state.session.token, state.proof);
    if (response.ok && response.body?.verified) {
      state.proof = null;
      markChallengeSpent();
      showVerified(response.body);
    } else {
      showRejected(response);
    }
  } catch (error) {
    setNotice("Could not reach the verifier. Check the network and try again.", true);
    showResult({
      kind: "rejected",
      badge: "Not sent",
      title: "Verifier unreachable",
      text: "Your proof is still ready. Try verification again when you are back online.",
      final: true
    });
    addLog("Verification request failed");
  } finally {
    state.phase = "idle";
    renderControls();
  }
}

function showProofFailure(error) {
  if (error instanceof CircuitRejection) {
    showResult({
      kind: "rejected",
      badge: "Rejected",
      title: "Credential did not pass",
      text: "No proof was produced. The issuer signature, KYC status, expiry, or age rule did not pass.",
      final: true
    });
    addLog("Proof generation rejected by circuit");
    return;
  }
  console.error("proof generation failed:", error.message);
  showResult({
    kind: "rejected",
    badge: "Failed",
    title: "Proof could not be created",
    text: "The prover did not finish on this device. Check your connection and try again.",
    final: true
  });
  addLog("Proof generation failed");
}

async function createProof() {
  state.phase = "proving";
  setNotice("");
  showResult({
    kind: "working",
    badge: "Working",
    title: "Generating proof",
    text: "Building the proof on this device. Nothing about your credential is sent yet."
  });
  renderControls();
  addLog("Proof generation started");

  const startedAt = performance.now();
  try {
    state.proof = await generateProof(buildProofInput(state.selected, state.session.challenge));
    addLog(`Proof generated in ${formatDuration(performance.now() - startedAt)}`);
  } catch (error) {
    showProofFailure(error);
  } finally {
    state.phase = "idle";
    renderControls();
  }
}

function issuerIsTrusted() {
  return state.selected.issuer.keyHash === state.session.verifier.issuer_key_hash;
}

async function checkEligibility() {
  if (!state.selected || isBusy()) {
    return;
  }
  if (!state.proof) {
    if (!(await ensureFreshChallenge())) {
      return;
    }
    if (!issuerIsTrusted()) {
      showResult({
        kind: "rejected",
        badge: "Untrusted issuer",
        title: "This issuer is not recognized",
        text: "The verifier does not trust the issuer that signed this credential. No proof was sent.",
        final: true
      });
      addLog("Credential rejected: issuer is not trusted");
      return;
    }
    await createProof();
  }
  if (state.proof) {
    await submitCurrentProof();
  }
}

function credentialOption(credential) {
  const imported = credential.kind === "imported";
  const input = createElement("input", {
    type: "radio",
    name: "credential",
    id: `credential-${credential.id}`,
    value: credential.id,
    checked: state.selected?.id === credential.id
  });
  input.addEventListener("change", () => selectCredential(credential));

  return createElement(
    "label",
    { className: "credential", htmlFor: input.id },
    input,
    createElement(
      "span",
      { className: "credential-body" },
      createElement("span", { className: "credential-title" }, credential.label),
      createElement("span", { className: "credential-desc" }, credential.description)
    ),
    createElement(
      "span",
      { className: `tag ${imported ? "tag-imported" : "tag-sample"}` },
      imported ? "Imported" : "Sample"
    )
  );
}

function renderCredentials() {
  byId("credentialList").replaceChildren(...state.credentials.map(credentialOption));
}

function detailRow(label, value, title = "") {
  return createElement(
    "div",
    {},
    createElement("dt", {}, label),
    createElement("dd", { title }, value)
  );
}

function selectCredential(credential) {
  state.selected = credential;
  state.proof = null;
  state.submitted = false;
  renderCredentials();

  const { uid, issuer, signature } = credential;
  byId("credentialDetails").replaceChildren(
    detailRow("Credential UID", shortenMiddle(uid), uid),
    detailRow("KYC status · local", credential.kyc_verified === "1" ? "Verified" : "Incomplete"),
    detailRow("Date of birth · local", formatCompactDate(credential.dob)),
    detailRow("Valid through · local", formatCompactDate(credential.expires_at)),
    detailRow("Issuer key hash", shortenMiddle(issuer.keyHash), issuer.keyHash),
    detailRow("Issuer signature", "Present", signature.r8x)
  );
  showReady();
  renderControls();
}

function setCredentialMessage(message, isError = false) {
  const element = byId("credentialMessage");
  element.hidden = !message;
  element.textContent = message;
  element.className = isError ? "import-message is-error" : "import-message";
}

async function importCredentialFile(file) {
  if (!file) {
    return;
  }
  try {
    if (file.size > MAX_CREDENTIAL_FILE_BYTES) {
      throw new Error("Credential files must be smaller than 512 KB.");
    }
    const imported = parseCredentialDocument(await file.text(), Date.now());
    state.credentials = [...imported, ...state.credentials.filter((c) => c.kind === "sample")];
    selectCredential(imported[0]);
    const summary = `${imported.length} credential${imported.length === 1 ? "" : "s"}`;
    setCredentialMessage(`${summary} loaded locally. The file is never uploaded.`);
    addLog(`${summary} imported locally`);
  } catch (error) {
    const unreadable = error instanceof SyntaxError;
    setCredentialMessage(unreadable ? "That file is not valid JSON." : error.message, true);
  } finally {
    byId("credentialFile").value = "";
  }
}

async function useAnotherSample() {
  if (isBusy()) {
    return;
  }
  const button = byId("newSample");
  button.disabled = true;
  try {
    const sample = await fetchDemoSample(state.selected?.uid);
    state.credentials = [sample, ...state.credentials.filter((c) => c.kind === "imported")];
    selectCredential(sample);
    await loadChallenge();
    setCredentialMessage("Fresh synthetic sample ready. Check eligibility to run the demo again.");
    addLog("Fresh demo sample selected");
  } catch (error) {
    setCredentialMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function refreshRequest() {
  if (isBusy()) {
    return;
  }
  setNotice("");
  state.submitted = false;
  if (await loadChallenge()) {
    showReady();
  }
}

async function copyReceipt() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(state.receipt, null, 2));
    setNotice("Verification receipt copied. It contains no date of birth or credential ID.");
  } catch (error) {
    setNotice("Clipboard access is unavailable. Open “View receipt JSON” to copy it.", true);
  }
}

async function loadInitialSample() {
  try {
    const sample = await fetchDemoSample();
    state.credentials = [sample];
    renderCredentials();
    selectCredential(sample);
  } catch (error) {
    setCredentialMessage(
      "No sample is available right now. Import a compatible signed credential to continue.",
      true
    );
  }
}

/** Connects the verification flow and loads its first sample and challenge. */
export async function initVerifyView() {
  byId("proveButton").addEventListener("click", checkEligibility);
  byId("newChallenge").addEventListener("click", refreshRequest);
  byId("newSample").addEventListener("click", useAnotherSample);
  byId("copyReceipt").addEventListener("click", copyReceipt);
  byId("credentialFile").addEventListener("change", (event) =>
    importCredentialFile(event.target.files[0])
  );
  renderControls();
  await Promise.all([loadInitialSample(), loadChallenge()]);
}
