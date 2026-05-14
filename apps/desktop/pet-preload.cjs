const { ipcRenderer } = require("electron");

const allowedMotionStates = new Set(["idle", "run-left", "run-right"]);
const allowedReactionStates = new Set(["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]);
let lastInteractiveHit = null;
let dragging = false;

ipcRenderer.on("openpets:pet-motion", (_event, state) => {
  if (!allowedMotionStates.has(state)) {
    return;
  }

  const apply = () => {
    document.documentElement.dataset.motionState = state;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
});

ipcRenderer.on("openpets:pet-reaction-state", (_event, state) => {
  if (!allowedReactionStates.has(state)) {
    return;
  }

  const apply = () => {
    document.documentElement.dataset.reactionState = state;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
});

const getInteractiveTarget = (event) => {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  return target && target.closest(".pet-shell, .bubble");
};

const setInteractiveHit = (interactive) => {
  if (lastInteractiveHit === interactive) return;
  lastInteractiveHit = interactive;
  ipcRenderer.send("openpets:pet-hit-test", interactive);
};

const updateInteractiveHit = (event) => {
  setInteractiveHit(Boolean(getInteractiveTarget(event)) || dragging);
};

const installMouseInterop = () => {
  lastInteractiveHit = null;
  dragging = false;

  document.addEventListener("mousemove", (event) => {
    updateInteractiveHit(event);
    if (dragging) ipcRenderer.send("openpets:pet-drag-move", { screenX: event.screenX, screenY: event.screenY });
  }, { passive: true });

  document.addEventListener("mousedown", (event) => {
    const target = getInteractiveTarget(event);
    setInteractiveHit(Boolean(target));
    if (event.button !== 0 || !target?.closest(".pet-shell")) return;
    event.preventDefault();
    dragging = true;
    setInteractiveHit(true);
    ipcRenderer.send("openpets:pet-drag-start", { screenX: event.screenX, screenY: event.screenY });
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    ipcRenderer.send("openpets:pet-drag-end");
  });

  document.addEventListener("mouseleave", () => {
    if (!dragging) setInteractiveHit(false);
  }, { passive: true });

  setInteractiveHit(false);
  ipcRenderer.send("openpets:pet-ready");
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installMouseInterop, { once: true });
} else {
  installMouseInterop();
}
