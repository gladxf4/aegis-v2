import { fetchChallenge, fetchFixtures, resetNullifiers, submitProof } from "./api.mjs";
import { buildProofInput } from "./credential.mjs";
import { CircuitRejection, generateProof } from "./prover.mjs";
import {
  expectsCircuitRejection,
  judgeResponse,
  SCENARIOS,
  tamperNullifier
} from "./scenarios.mjs";
import { state } from "./state.mjs";
import { addLog, byId, createElement, setNotice } from "./ui.mjs";
import { renderControls } from "./verify-view.mjs";

const RESULT_CLASSES = {
  pass: "result-pass",
  fail: "result-fail",
  run: "result-run",
  pending: "result-muted"
};

const resultCells = new Map();
let fixtures = null;

const demoModeOn = () => Boolean(state.health?.demo_mode);

function updateSummary() {
  const statuses = Array.from(resultCells.values(), (cell) => cell.dataset.status);
  const passed = statuses.filter((status) => status === "pass").length;
  const failed = statuses.filter((status) => status === "fail").length;
  let summary = `${passed} passed, ${failed} failed, ${statuses.length - passed - failed} not run.`;
  if (passed + failed === 0) {
    summary = demoModeOn() ? "No cases run." : "Case runs are disabled on the public verifier.";
  }
  byId("testSummary").textContent = summary;
}

function setCaseResult(scenario, status, text) {
  const cell = resultCells.get(scenario.id);
  cell.dataset.status = status;
  cell.className = RESULT_CLASSES[status];
  cell.textContent = text;
  updateSummary();
}

function setControlsLocked(locked) {
  state.testRunning = locked;
  const disabled = locked || !demoModeOn();
  for (const button of byId("testRows").querySelectorAll("button")) {
    button.disabled = disabled;
  }
  byId("runAll").disabled = disabled;
  byId("resetRegistry").disabled = disabled;
  renderControls();
}

async function credentialFor(id) {
  fixtures ??= await fetchFixtures();
  const credential = fixtures.find((item) => item.id === id);
  if (!credential) {
    throw new Error(`Missing test credential: ${id}`);
  }
  return credential;
}

async function proveScenario(scenario, session) {
  const credential = await credentialFor(scenario.credential);
  const input = buildProofInput(credential, session.challenge, scenario.overrides);
  try {
    return await generateProof(input);
  } catch (error) {
    if (error instanceof CircuitRejection) {
      return null;
    }
    throw error;
  }
}

async function submitScenario(scenario, session, generated) {
  const submission = scenario.tamperNullifier
    ? { ...generated, publicSignals: tamperNullifier(generated.publicSignals) }
    : generated;
  if (!scenario.replay) {
    return submitProof(session.token, submission);
  }
  const first = await submitProof(session.token, submission);
  if (!first.body?.verified) {
    throw new Error("First submission was not verified");
  }
  return submitProof(session.token, submission);
}

/** Runs one case from a clean nullifier registry and returns its verdict. */
async function evaluateScenario(scenario) {
  await resetNullifiers();
  const session = await fetchChallenge();
  const generated = await proveScenario(scenario, session);

  if (expectsCircuitRejection(scenario)) {
    return generated
      ? { passed: false, text: "Proof was generated" }
      : { passed: true, text: "Pass (circuit rejected)" };
  }
  if (!generated) {
    return { passed: false, text: "Proof generation failed" };
  }
  return judgeResponse(scenario, await submitScenario(scenario, session, generated));
}

async function runScenario(scenario) {
  setCaseResult(scenario, "run", "Running");
  try {
    const { passed, text } = await evaluateScenario(scenario);
    setCaseResult(scenario, passed ? "pass" : "fail", text);
  } catch (error) {
    setCaseResult(scenario, "fail", error.message);
  }
}

async function runExclusive(work) {
  if (state.testRunning || state.phase !== "idle") {
    return;
  }
  setNotice("");
  setControlsLocked(true);
  try {
    await work();
  } finally {
    setControlsLocked(false);
  }
}

async function runAllScenarios() {
  await runExclusive(async () => {
    for (const scenario of SCENARIOS) {
      setCaseResult(scenario, "pending", "Not run");
    }
    for (const scenario of SCENARIOS) {
      await runScenario(scenario);
    }
    addLog("Test bench finished");
  });
}

async function clearRegistry() {
  try {
    const cleared = await resetNullifiers();
    setNotice(cleared ? "Nullifier registry cleared." : "Reset is disabled here.", !cleared);
    if (cleared) {
      addLog("Nullifier registry cleared");
    }
  } catch (error) {
    setNotice(error.message, true);
  }
}

function scenarioRow(scenario) {
  const resultCell = createElement("td", { className: RESULT_CLASSES.pending }, "Not run");
  resultCell.dataset.status = "pending";
  resultCells.set(scenario.id, resultCell);

  const button = createElement(
    "button",
    { type: "button", className: "button button-secondary button-small" },
    "Run"
  );
  button.setAttribute("aria-label", `Run ${scenario.name} test`);
  button.addEventListener("click", () => runExclusive(() => runScenario(scenario)));

  return createElement(
    "tr",
    {},
    createElement(
      "th",
      { scope: "row" },
      createElement("span", { className: "test-name" }, scenario.name),
      createElement("span", { className: "test-note" }, scenario.note)
    ),
    createElement("td", { className: "mono" }, scenario.label),
    resultCell,
    createElement("td", {}, button)
  );
}

/** Builds the case table. Call after the health report has loaded. */
export function initTestBench() {
  byId("testRows").replaceChildren(...SCENARIOS.map(scenarioRow));
  byId("runAll").addEventListener("click", runAllScenarios);
  byId("resetRegistry").addEventListener("click", clearRegistry);
  byId("resetRegistry").hidden = !demoModeOn();
  byId("runAll").title = demoModeOn() ? "" : "Available when running locally";
  setControlsLocked(false);
  updateSummary();
}
