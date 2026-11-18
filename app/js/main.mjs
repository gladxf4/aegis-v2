import { fetchHealth } from "./api.mjs";
import { initNavigation } from "./navigation.mjs";
import { state } from "./state.mjs";
import { initTestBench } from "./test-bench.mjs";
import { byId, initLog, setNotice } from "./ui.mjs";
import { initVerifyView } from "./verify-view.mjs";

async function loadHealth() {
  try {
    const health = await fetchHealth();
    state.health = health;
    const backend = `${health.store} state · issuer ${health.issuer_registry}`;
    byId("healthLine").textContent = health.ok ? `ready · ${backend}` : "not ready";
    byId("storeMode").textContent = backend;
    if (!health.ok) {
      setNotice("The verifier is not ready. Try again shortly.", true);
    }
  } catch (error) {
    byId("healthLine").textContent = "status unavailable";
    setNotice(error.message, true);
  }
}

initNavigation();
initLog();
await Promise.all([loadHealth().then(initTestBench), initVerifyView()]);
