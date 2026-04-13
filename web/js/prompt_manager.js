/**
 * Arbo Tools — Prompt Manager frontend extension.
 *
 * Auto-loads saved prompts when the user changes the load_preset combo.
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const API_BASE = "/arbo-tools";

app.registerExtension({
  name: "ArboTools.PromptManager",

  async nodeCreated(node) {
    if (node.comfyClass === "ArboTools_PromptPair") {
      setupPromptPair(node);
    }
    if (node.comfyClass === "ArboTools_NegativeLibrary") {
      setupNegativeLibrary(node);
    }
  },
});

function findWidget(node, name) {
  return node.widgets?.find(w => w.name === name);
}

// ── Prompt Pair ─────────────────────────────────────────────────────

function setupPromptPair(node) {
  const loadW = findWidget(node, "load_preset");
  if (!loadW) return;

  const originalCallback = loadW.callback;
  loadW.callback = async function(value) {
    if (originalCallback) originalCallback.call(this, value);
    if (value && value !== "(none)") {
      await loadPromptIntoNode(node, value);
    }
  };
}

async function loadPromptIntoNode(node, path) {
  try {
    const resp = await fetch(`${API_BASE}/prompts/load?path=${encodeURIComponent(path)}`);
    if (!resp.ok) return;
    const data = await resp.json();

    const positiveW = findWidget(node, "positive");
    const negativeW = findWidget(node, "negative");
    const saveCatW = findWidget(node, "save_category");
    const saveNameW = findWidget(node, "save_name");

    if (positiveW && data.positive != null) positiveW.value = data.positive;
    if (negativeW && data.negative != null) negativeW.value = data.negative;
    if (saveCatW && data.category != null) saveCatW.value = data.category;
    if (saveNameW && data.name != null) saveNameW.value = data.name;

    node.setDirtyCanvas(true);
  } catch (e) {
    console.error("ArboTools: Failed to load prompt", e);
  }
}

// ── Negative Library ────────────────────────────────────────────────

function setupNegativeLibrary(node) {
  const loadW = findWidget(node, "load_preset");
  if (!loadW) return;

  const originalCallback = loadW.callback;
  loadW.callback = async function(value) {
    if (originalCallback) originalCallback.call(this, value);
    if (value && value !== "(new)") {
      await loadNeglibIntoNode(node, value);
    }
  };
}

async function loadNeglibIntoNode(node, name) {
  try {
    const resp = await fetch(`${API_BASE}/neglib/load?name=${encodeURIComponent(name)}`);
    if (!resp.ok) return;
    const data = await resp.json();

    const titleW = findWidget(node, "title");
    const contentW = findWidget(node, "content");

    if (titleW && data.name != null) titleW.value = data.name;
    if (contentW && data.text != null) contentW.value = data.text;

    node.setDirtyCanvas(true);
  } catch (e) {
    console.error("ArboTools: Failed to load neglib entry", e);
  }
}
