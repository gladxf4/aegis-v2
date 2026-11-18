const MAX_LOG_ENTRIES = 30;
const logEntries = [];

export function byId(id) {
  return document.getElementById(id);
}

/** Creates an element with properties and text or element children. */
export function createElement(tag, properties = {}, ...children) {
  const element = Object.assign(document.createElement(tag), properties);
  element.append(...children);
  return element;
}

export function setNotice(message, isError = false) {
  const notice = byId("notice");
  notice.hidden = !message;
  notice.textContent = message;
  notice.className = isError ? "notice is-error" : "notice";
}

/** Sends a short message to screen readers without changing the visible page. */
export function announce(message) {
  byId("liveStatus").textContent = message;
}

function renderLog() {
  const log = byId("log");
  if (logEntries.length === 0) {
    log.replaceChildren(createElement("li", { className: "empty" }, "No events yet."));
    return;
  }
  log.replaceChildren(
    ...logEntries.map(({ at, message }) =>
      createElement(
        "li",
        {},
        createElement("time", {}, at.toLocaleTimeString([], { hour12: false })),
        createElement("span", {}, message)
      )
    )
  );
  log.scrollTop = log.scrollHeight;
}

export function addLog(message) {
  logEntries.push({ at: new Date(), message });
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.shift();
  }
  renderLog();
}

export function initLog() {
  byId("clearLog").addEventListener("click", () => {
    logEntries.length = 0;
    renderLog();
  });
  renderLog();
}
