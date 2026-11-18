import { fetchChallenge } from "./api.mjs";
import { hasUsableChallenge, isBusy } from "./control-state.mjs";
import { renderControls } from "./controls.mjs";
import { formatCompactDate, formatCountdown, shortenMiddle } from "./format.mjs";
import { state } from "./state.mjs";
import { addLog, byId, setNotice } from "./ui.mjs";

let expiryTimer = null;

function setRequestStatus(message, status) {
  byId("challengeState").textContent = message;
  byId("requestBar").dataset.state = status;
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

function handleExpiry() {
  stopExpiryTimer();
  byId("expires").textContent = "expired";
  addLog("Challenge expired");
  if (isBusy(state)) {
    setRequestStatus("Request expired", "expired");
    return;
  }
  // Renewing automatically means no one has to race the timer (WCAG 2.2.1).
  loadChallenge();
}

function startExpiryTimer() {
  stopExpiryTimer();
  const deadline = Date.parse(state.session.challenge.expires_at);
  const tick = () => {
    const remaining = deadline - Date.now();
    byId("expires").textContent = formatCountdown(remaining);
    if (remaining <= 0) {
      handleExpiry();
    }
  };
  expiryTimer = setInterval(tick, 1000);
  tick();
}

export function markChallengeSpent() {
  state.challengeSpent = true;
  stopExpiryTimer();
  byId("expires").textContent = "refresh to check again";
  setRequestStatus("Request used", "expired");
}

/** @returns {Promise<boolean>} True when a usable challenge was loaded */
export async function loadChallenge() {
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

export async function ensureFreshChallenge() {
  return hasUsableChallenge(state, Date.now()) || loadChallenge();
}
