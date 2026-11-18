import { fetchDemoSample } from "./api.mjs";
import { loadChallenge } from "./challenge-session.mjs";
import { isBusy } from "./control-state.mjs";
import { renderControls } from "./controls.mjs";
import { initCredentialImport, setCredentialMessage, useSample } from "./credential-picker.mjs";
import { checkEligibility } from "./proof-flow.mjs";
import { showReady } from "./result-panel.mjs";
import { state } from "./state.mjs";
import { addLog, byId, setNotice } from "./ui.mjs";

async function useAnotherSample() {
  if (isBusy(state)) {
    return;
  }
  const button = byId("newSample");
  button.disabled = true;
  try {
    useSample(await fetchDemoSample(state.selected?.uid));
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
  if (isBusy(state)) {
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
    useSample(await fetchDemoSample());
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
  initCredentialImport();
  renderControls();
  await Promise.all([loadInitialSample(), loadChallenge()]);
}
