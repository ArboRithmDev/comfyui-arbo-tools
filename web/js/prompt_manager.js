/**
 * Arbo Tools — Prompt Manager frontend extension.
 *
 * Handles dynamic loading of saved prompts when the user changes
 * the preset combo, and auto-populates positive/negative fields.
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
  const promptNameW = findWidget(node, "prompt_name");
  if (!promptNameW) return;

  const originalCallback = promptNameW.callback;
  promptNameW.callback = async function(value) {
    if (originalCallback) originalCallback.call(this, value);
    if (value && value !== "(new)") {
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
    const categoryW = findWidget(node, "category");

    if (positiveW && data.positive != null) {
      positiveW.value = data.positive;
    }
    if (negativeW && data.negative != null) {
      negativeW.value = data.negative;
    }
    if (categoryW && data.category) {
      categoryW.value = data.category;
    }

    node.setDirtyCanvas(true);
  } catch (e) {
    console.error("ArboTools: Failed to load prompt", e);
  }
}

// ── Negative Library ────────────────────────────────────────────────

function setupNegativeLibrary(node) {
  const presetW = findWidget(node, "preset");
  if (!presetW) return;

  const originalCallback = presetW.callback;
  presetW.callback = async function(value) {
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

    if (titleW) titleW.value = data.name || name;
    if (contentW && data.text != null) contentW.value = data.text;

    node.setDirtyCanvas(true);
  } catch (e) {
    console.error("ArboTools: Failed to load neglib entry", e);
  }
}
