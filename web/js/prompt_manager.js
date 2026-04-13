/**
 * Arbo Tools — Prompt Manager frontend.
 *
 * Adds "+" and "New" buttons to the Prompt Pair node for creating
 * categories and prompts via popups. Handles auto-loading of saved
 * prompts when selections change.
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const API = "/arbo-tools";

// ── Popup styles ────────────────────────────────────────────────────

const STYLE = document.createElement("style");
STYLE.textContent = `
  .arbo-popup-overlay {
    position: fixed; inset: 0; z-index: 100000;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
  }
  .arbo-popup {
    background: #1e1e2e; border: 1px solid #555; border-radius: 10px;
    padding: 20px; min-width: 320px; max-width: 420px;
    font-family: -apple-system, sans-serif; color: #e0e0e0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }
  .arbo-popup h3 {
    margin: 0 0 14px; font-size: 14px; color: #fff;
  }
  .arbo-popup label {
    display: block; font-size: 11px; color: #888;
    margin-bottom: 4px; margin-top: 10px;
  }
  .arbo-popup input {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    background: #2a2a3a; border: 1px solid #444; border-radius: 6px;
    color: #e0e0e0; font-size: 13px; outline: none;
  }
  .arbo-popup input:focus { border-color: #4ecdc4; }
  .arbo-popup .hint {
    font-size: 10px; color: #666; margin-top: 3px;
  }
  .arbo-popup .buttons {
    display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;
  }
  .arbo-popup button {
    padding: 6px 16px; border-radius: 6px; border: none;
    font-size: 12px; cursor: pointer; transition: background 0.15s;
  }
  .arbo-popup .btn-cancel {
    background: #333; color: #aaa;
  }
  .arbo-popup .btn-cancel:hover { background: #444; }
  .arbo-popup .btn-ok {
    background: #4ecdc4; color: #1e1e2e; font-weight: 600;
  }
  .arbo-popup .btn-ok:hover { background: #3dbdb5; }
`;

// ── Popup helpers ───────────────────────────────────────────────────

function showPopup(title, fields, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "arbo-popup-overlay";

  let fieldsHtml = "";
  for (const f of fields) {
    fieldsHtml += `
      <label>${f.label}</label>
      <input type="text" id="arbo-popup-${f.id}" value="${f.value || ""}" placeholder="${f.placeholder || ""}">
      ${f.hint ? `<div class="hint">${f.hint}</div>` : ""}
    `;
  }

  overlay.innerHTML = `
    <div class="arbo-popup">
      <h3>${title}</h3>
      ${fieldsHtml}
      <div class="buttons">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-ok">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus first input
  const firstInput = overlay.querySelector("input");
  if (firstInput) setTimeout(() => firstInput.focus(), 50);

  // Enter key = OK
  overlay.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") overlay.querySelector(".btn-ok").click();
      if (e.key === "Escape") overlay.remove();
    });
  });

  overlay.querySelector(".btn-cancel").onclick = () => overlay.remove();
  overlay.querySelector(".btn-ok").onclick = () => {
    const values = {};
    for (const f of fields) {
      values[f.id] = overlay.querySelector(`#arbo-popup-${f.id}`).value.trim();
    }
    overlay.remove();
    onConfirm(values);
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ── Widget helpers ──────────────────────────────────────────────────

function findWidget(node, name) {
  return node.widgets?.find(w => w.name === name);
}

function updateComboOptions(widget, options) {
  if (widget.options?.values) {
    widget.options.values = options;
  }
  if (widget.type === "combo") {
    widget.options.values = options;
  }
}

async function refreshCategories(node) {
  try {
    const resp = await fetch(`${API}/prompts/categories`);
    const cats = await resp.json();
    const w = findWidget(node, "category");
    if (w) updateComboOptions(w, ["(all)", ...cats]);
  } catch (e) { /* silent */ }
}

async function refreshPrompts(node) {
  try {
    const resp = await fetch(`${API}/prompts/names`);
    const names = await resp.json();
    const w = findWidget(node, "prompt");
    if (w) updateComboOptions(w, ["(none)", ...names]);
  } catch (e) { /* silent */ }
}

// ── Node setup ──────────────────────────────────────────────────────

function setupPromptPair(node) {
  // ── "+" button after category ──
  const addCatBtn = node.addWidget("button", "➕ New Category", null, () => {
    showPopup("New Category", [
      {
        id: "cat",
        label: "Category path",
        placeholder: "e.g. Personnages\\Fantasy\\Elfes",
        hint: "Use \\ to create sub-categories",
      },
    ], async (values) => {
      if (!values.cat) return;
      // Save an empty prompt in this category to register it
      await fetch(`${API}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "_category_placeholder",
          category: values.cat,
          positive: "", negative: "",
        }),
      });
      await refreshCategories(node);
      const catW = findWidget(node, "category");
      if (catW) catW.value = values.cat;
      node.setDirtyCanvas(true);
    });
  });

  // ── "New" button after prompt ──
  const newPromptBtn = node.addWidget("button", "📝 New Prompt", null, () => {
    const catW = findWidget(node, "category");
    const currentCat = catW?.value !== "(all)" ? catW?.value || "" : "";

    showPopup("New Prompt", [
      {
        id: "name",
        label: "Prompt name",
        placeholder: "e.g. Chamane v1",
      },
      {
        id: "cat",
        label: "Category",
        value: currentCat,
        placeholder: "e.g. Personnages\\Fantasy",
        hint: "Leave empty for root level",
      },
    ], async (values) => {
      if (!values.name) return;
      const cat = values.cat || "";
      const path = cat ? `${cat}\\${values.name}` : values.name;

      // Save empty prompt
      await fetch(`${API}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          category: cat,
          positive: "", negative: "",
        }),
      });

      await refreshCategories(node);
      await refreshPrompts(node);

      // Select the new prompt
      const promptW = findWidget(node, "prompt");
      if (promptW) promptW.value = path;

      // Clear text fields for new prompt
      const posW = findWidget(node, "positive");
      const negW = findWidget(node, "negative");
      if (posW) posW.value = "";
      if (negW) negW.value = "";

      node.setDirtyCanvas(true);
    });
  });

  // ── Reorder widgets: category, +, prompt, new, auto_save, auto_replace, positive, negative ──
  const order = ["category", addCatBtn.name, "prompt", newPromptBtn.name,
                  "auto_save", "auto_replace", "positive", "negative"];
  node.widgets.sort((a, b) => {
    const ai = order.indexOf(a.name);
    const bi = order.indexOf(b.name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // ── Auto-load on prompt change ──
  const promptW = findWidget(node, "prompt");
  if (promptW) {
    const orig = promptW.callback;
    promptW.callback = async function(value) {
      if (orig) orig.call(this, value);
      if (value && value !== "(none)") {
        await loadPrompt(node, value);
      }
    };
  }
}

async function loadPrompt(node, path) {
  try {
    const resp = await fetch(`${API}/prompts/load?path=${encodeURIComponent(path)}`);
    if (!resp.ok) return;
    const data = await resp.json();

    const posW = findWidget(node, "positive");
    const negW = findWidget(node, "negative");

    if (posW && data.positive != null) posW.value = data.positive;
    if (negW && data.negative != null) negW.value = data.negative;

    node.setDirtyCanvas(true);
  } catch (e) {
    console.error("ArboTools: Failed to load prompt", e);
  }
}

// ── Extension registration ──────────────────────────────────────────

app.registerExtension({
  name: "ArboTools.PromptManager",

  setup() {
    document.head.appendChild(STYLE);
  },

  async nodeCreated(node) {
    if (node.comfyClass === "ArboTools_PromptPair") {
      setupPromptPair(node);
    }
  },
});
