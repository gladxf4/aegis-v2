import { submitProof } from "./api.mjs";
import { ensureFreshChallenge, markChallengeSpent } from "./challenge-session.mjs";
import { isBusy } from "./control-state.mjs";
import { renderControls } from "./controls.mjs";
import { buildProofInput } from "./credential.mjs";
import { formatCompactDate, formatDuration, shortenMiddle } from "./format.mjs";
import { buildReceipt, describeRejection, isRetryableRejection } from "./outcome.mjs";
import { CircuitRejection, generateProof } from "./prover.mjs";
import { showResult } from "./result-panel.mjs";
import { state } from "./state.mjs";
import { addLog, setNotice } from "./ui.mjs";

function showRejection(badge, title, text) {
  showResult({ kind: "rejected", badge, title, text, final: true });
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

function showVerifierRejection(response) {
  const { code, text } = describeRejection(response, state.selected.kind);
  const retryable = isRetryableRejection(code);
  state.submitted = !retryable;
  if (!retryable) {
    state.proof = null;
    markChallengeSpent();
  }
  showRejection("Not accepted", "Proof not accepted", text);
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
      showVerifierRejection(response);
    }
  } catch (error) {
    setNotice("Could not reach the verifier. Check the network and try again.", true);
    showRejection(
      "Not sent",
      "Verifier unreachable",
      "Your proof is still ready. Try verification again when you are back online."
    );
    addLog("Verification request failed");
  } finally {
    state.phase = "idle";
    renderControls();
  }
}

function showProofFailure(error) {
  if (error instanceof CircuitRejection) {
    showRejection(
      "Rejected",
      "Credential did not pass",
      "No proof was produced. The issuer signature, KYC status, expiry, or age rule did not pass."
    );
    addLog("Proof generation rejected by circuit");
    return;
  }
  console.error("proof generation failed:", error.message);
  showRejection(
    "Failed",
    "Proof could not be created",
    "The prover did not finish on this device. Check your connection and try again."
  );
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

/** Creates a proof when needed, then submits it to the verifier. */
export async function checkEligibility() {
  if (!state.selected || isBusy(state)) {
    return;
  }
  if (!state.proof) {
    if (!(await ensureFreshChallenge())) {
      return;
    }
    if (!issuerIsTrusted()) {
      showRejection(
        "Untrusted issuer",
        "This issuer is not recognized",
        "The verifier does not trust the issuer that signed this credential. No proof was sent."
      );
      addLog("Credential rejected: issuer is not trusted");
      return;
    }
    await createProof();
  }
  if (state.proof) {
    await submitCurrentProof();
  }
}
