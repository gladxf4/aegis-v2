import { renderControls } from "./controls.mjs";
import { MAX_CREDENTIAL_FILE_BYTES, parseCredentialDocument } from "./credential.mjs";
import { formatCompactDate, shortenMiddle } from "./format.mjs";
import { showReady } from "./result-panel.mjs";
import { state } from "./state.mjs";
import { addLog, byId, createElement } from "./ui.mjs";

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

function detailRow(label, value, title = "") {
  return createElement(
    "div",
    {},
    createElement("dt", {}, label),
    createElement("dd", { title }, value)
  );
}

function renderDetails({ uid, issuer, signature, kyc_verified, dob, expires_at }) {
  byId("credentialDetails").replaceChildren(
    detailRow("Credential UID", shortenMiddle(uid), uid),
    detailRow("KYC status · local", kyc_verified === "1" ? "Verified" : "Incomplete"),
    detailRow("Date of birth · local", formatCompactDate(dob)),
    detailRow("Valid through · local", formatCompactDate(expires_at)),
    detailRow("Issuer key hash", shortenMiddle(issuer.keyHash), issuer.keyHash),
    detailRow("Issuer signature", "Present", signature.r8x)
  );
}

export function selectCredential(credential) {
  state.selected = credential;
  state.proof = null;
  state.submitted = false;
  byId("credentialList").replaceChildren(...state.credentials.map(credentialOption));
  renderDetails(credential);
  showReady();
  renderControls();
}

export function setCredentialMessage(message, isError = false) {
  const element = byId("credentialMessage");
  element.hidden = !message;
  element.textContent = message;
  element.className = isError ? "import-message is-error" : "import-message";
}

/** Replaces the listed sample and selects it, keeping imported credentials. */
export function useSample(sample) {
  state.credentials = [sample, ...state.credentials.filter((item) => item.kind === "imported")];
  selectCredential(sample);
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

export function initCredentialImport() {
  byId("credentialFile").addEventListener("change", (event) =>
    importCredentialFile(event.target.files[0])
  );
}
