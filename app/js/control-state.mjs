// A proof can take several seconds on a phone, so it starts with time to spare.
const MIN_CHALLENGE_LIFETIME_MS = 45_000;

export function isBusy(state) {
  return state.phase !== "idle" || state.testRunning;
}

export function proveButtonLabel(state) {
  if (state.phase === "proving") {
    return "Creating proof on this device…";
  }
  if (state.phase === "verifying") {
    return "Checking eligibility…";
  }
  return state.proof ? "Try verification again" : "Check eligibility";
}

export function proveHint(state) {
  if (!state.selected) {
    return "Choose or import a credential to continue.";
  }
  if (state.submitted) {
    return "This credential has a result. Choose another credential or sample to check again.";
  }
  return "";
}

export function canCheckEligibility(state) {
  return Boolean(state.selected && state.session && !state.submitted && !isBusy(state));
}

export function currentJourneyStep(state) {
  if (state.phase === "verifying" || state.submitted) {
    return 3;
  }
  return state.selected && state.session ? 2 : 1;
}

/** Decides whether the current challenge can safely back a new proof. */
export function hasUsableChallenge(state, now) {
  return Boolean(
    state.session &&
    !state.challengeSpent &&
    Date.parse(state.session.challenge.expires_at) - now > MIN_CHALLENGE_LIFETIME_MS
  );
}
