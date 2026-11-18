/** Client state shared by the verification flow and the test bench. */
export const state = {
  /** Response from /api/challenge. */
  session: null,
  /** The session's challenge was sent to the verifier and cannot be reused. */
  challengeSpent: false,
  credentials: [],
  selected: null,
  /** Generated proof awaiting submission. */
  proof: null,
  /** "idle", "proving", or "verifying". */
  phase: "idle",
  /** The selected credential has a final verifier answer. */
  submitted: false,
  receipt: null,
  health: null,
  testRunning: false
};

export function isBusy() {
  return state.phase !== "idle" || state.testRunning;
}
