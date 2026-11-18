import { byId } from "./ui.mjs";

const NAVIGATION_KEYS = new Set(["ArrowRight", "ArrowLeft", "Home", "End"]);

function showView(tabs, name) {
  for (const tab of tabs) {
    const active = tab.dataset.view === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const view of document.querySelectorAll(".view")) {
    const active = view.id === `view-${name}`;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  }
}

function targetIndex(key, current, count) {
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  return (current + (key === "ArrowRight" ? 1 : -1) + count) % count;
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll(".tab"));
  for (const tab of tabs) {
    tab.addEventListener("click", () => showView(tabs, tab.dataset.view));
  }
  document.querySelector(".tabs").addEventListener("keydown", (event) => {
    if (!NAVIGATION_KEYS.has(event.key)) {
      return;
    }
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab.classList.contains("is-active"));
    const next = tabs[targetIndex(event.key, current, tabs.length)];
    next.focus();
    showView(tabs, next.dataset.view);
  });
}

function initJourneyLinks() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  for (const action of document.querySelectorAll(".journey-action")) {
    action.addEventListener("click", () => {
      const target = byId(action.dataset.journeyTarget);
      target.scrollIntoView({
        behavior: reduceMotion.matches ? "auto" : "smooth",
        block: "center"
      });
      if (target.tabIndex < 0) {
        target.tabIndex = -1;
      }
      target.focus({ preventScroll: true });
    });
  }
}

export function initNavigation() {
  initTabs();
  initJourneyLinks();
}
