import {
  canCheckEligibility,
  currentJourneyStep,
  isBusy,
  proveButtonLabel,
  proveHint
} from "./control-state.mjs";
import { state } from "./state.mjs";
import { byId } from "./ui.mjs";

function renderJourney() {
  const currentStep = currentJourneyStep(state);
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

/** Synchronizes the primary controls and journey with the current state. */
export function renderControls() {
  const button = byId("proveButton");
  const hint = proveHint(state);
  button.disabled = !canCheckEligibility(state);
  button.textContent = proveButtonLabel(state);
  byId("proveHint").textContent = hint;
  byId("proveHint").hidden = !hint;
  byId("newChallenge").disabled = isBusy(state);
  renderJourney();
}
