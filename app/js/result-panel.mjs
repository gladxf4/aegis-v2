import { state } from "./state.mjs";
import { announce, byId, createElement } from "./ui.mjs";

const READY_TEXT =
  "Your browser will create a private proof, then show the verifier’s answer here.";
const RESULT_MARKS = {
  verified: { src: "/assets/verified-mark.png", alt: "Verification passed" },
  rejected: { src: "/assets/review-mark.png", alt: "Verification rejected" }
};

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

function renderMark(kind) {
  const mark = RESULT_MARKS[kind];
  const image = byId("resultMark");
  image.hidden = !mark;
  image.alt = mark?.alt ?? "";
  if (mark) {
    image.src = mark.src;
  }
}

/** Renders the result panel. Final results also move focus to their heading. */
export function showResult({ kind = "", badge, title, text, meta = [], final = false }) {
  if (kind !== "verified") {
    state.receipt = null;
  }
  renderReceipt();
  renderMark(kind);
  byId("newSample").hidden = !(state.selected?.kind === "sample" && state.submitted);
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

export function showReady() {
  showResult({ badge: "Idle", title: "Ready to check", text: READY_TEXT });
}
