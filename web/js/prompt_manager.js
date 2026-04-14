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
  .arbo-toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 100001;
    background: #1e1e2e; border: 1px solid #4ecdc4; border-radius: 8px;
    padding: 10px 18px; font-family: -apple-system, sans-serif;
    font-size: 12px; color: #4ecdc4; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    opacity: 0; transform: translateY(10px);
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: none;
  }
  .arbo-toast.show { opacity: 1; transform: translateY(0); }
  .arbo-popup .field-wrap { position: relative; }
  .arbo-autocomplete {
    position: absolute; left: 0; right: 0; top: 100%;
    background: #2a2a3a; border: 1px solid #555; border-top: none;
    border-radius: 0 0 6px 6px; max-height: 150px; overflow-y: auto;
    z-index: 10;
  }
  .arbo-autocomplete .ac-item {
    padding: 6px 10px; font-size: 12px; color: #ccc; cursor: pointer;
  }
  .arbo-autocomplete .ac-item:hover,
  .arbo-autocomplete .ac-item.active {
    background: #333; color: #4ecdc4;
  }
  .arbo-autocomplete .ac-item .ac-match {
    color: #4ecdc4; font-weight: 600;
  }
  .arbo-autocomplete .ac-new {
    padding: 6px 10px; font-size: 11px; color: #888;
    border-top: 1px solid #333; font-style: italic;
  }
`;

// ── Autocomplete cache ──────────────────────────────────────────────

let _cachedCategories = null;

async function getCachedCategories() {
  if (!_cachedCategories) {
    try {
      const resp = await fetch(`${API}/prompts/categories`);
      _cachedCategories = await resp.json();
    } catch { _cachedCategories = []; }
  }
  return _cachedCategories;
}

function invalidateCategoryCache() { _cachedCategories = null; }

// ── Autocomplete widget ─────────────────────────────────────────────

function attachAutocomplete(input, getSuggestions) {
  let dropdown = null;
  let activeIdx = -1;

  function close() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
    activeIdx = -1;
  }

  function highlight(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + `<span class="ac-match">${text.slice(idx, idx + query.length)}</span>` + text.slice(idx + query.length);
  }

  async function update() {
    const query = input.value.trim();
    const suggestions = await getSuggestions(query);

    close();
    if (suggestions.length === 0 && !query) return;

    dropdown = document.createElement("div");
    dropdown.className = "arbo-autocomplete";

    for (let i = 0; i < suggestions.length; i++) {
      const item = document.createElement("div");
      item.className = "ac-item";
      item.innerHTML = highlight(suggestions[i], query);
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = suggestions[i];
        close();
        input.dispatchEvent(new Event("input"));
      });
      dropdown.appendChild(item);
    }

    // "Create new" hint if query doesn't match any existing
    if (query && !suggestions.some(s => s.toLowerCase() === query.toLowerCase())) {
      const newItem = document.createElement("div");
      newItem.className = "ac-new";
      newItem.textContent = `↵ Create "${query}"`;
      dropdown.appendChild(newItem);
    }

    input.parentElement.appendChild(dropdown);
  }

  input.addEventListener("input", update);
  input.addEventListener("focus", update);
  input.addEventListener("blur", () => setTimeout(close, 200));

  input.addEventListener("keydown", (e) => {
    if (!dropdown) return;
    const items = dropdown.querySelectorAll(".ac-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle("active", i === activeIdx));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      items.forEach((it, i) => it.classList.toggle("active", i === activeIdx));
    } else if (e.key === "Tab" && activeIdx >= 0) {
      e.preventDefault();
      input.value = items[activeIdx].textContent;
      close();
    }
  });
}

// ── Popup helpers ───────────────────────────────────────────────────

function showPopup(title, fields, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "arbo-popup-overlay";

  let fieldsHtml = "";
  for (const f of fields) {
    fieldsHtml += `
      <label>${f.label}</label>
      <div class="field-wrap">
        <input type="text" id="arbo-popup-${f.id}" value="${f.value || ""}" placeholder="${f.placeholder || ""}">
      </div>
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

  // Attach autocomplete to category fields
  for (const f of fields) {
    if (f.autocomplete) {
      const inp = overlay.querySelector(`#arbo-popup-${f.id}`);
      if (inp) attachAutocomplete(inp, f.autocomplete);
    }
  }

  // Focus first input
  const firstInput = overlay.querySelector("input");
  if (firstInput) setTimeout(() => firstInput.focus(), 50);

  // Enter key = OK (only if no autocomplete dropdown is open)
  overlay.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !overlay.querySelector(".arbo-autocomplete")) {
        overlay.querySelector(".btn-ok").click();
      }
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

// ── Toast notification ──────────────────────────────────────────────

let _toastEl = null;
let _toastTimer = null;

function showToast(message) {
  if (!_toastEl) {
    _toastEl = document.createElement("div");
    _toastEl.className = "arbo-toast";
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = message;
  _toastEl.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => _toastEl.classList.remove("show"), 2000);
}

// ── Auto-save (debounced) ───────────────────────────────────────────

const _saveTimers = new WeakMap();
const SAVE_DELAY = 400;

function scheduleAutoSave(node) {
  clearTimeout(_saveTimers.get(node));
  _saveTimers.set(node, setTimeout(() => doAutoSave(node), SAVE_DELAY));
}

async function doAutoSave(node) {
  const autoSaveW = findWidget(node, "auto_save");
  if (!autoSaveW?.value) return;

  // Don't auto-save from widget if Prompt Studio is open on the same prompt
  // The studio is the source of truth when open
  if (window._psStudioOpenPath) return;

  const promptW = findWidget(node, "prompt");
  const posW = findWidget(node, "positive");
  const negW = findWidget(node, "negative");
  const displayName = promptW?.value;
  if (!displayName || displayName === "(none)") return;

  const positive = posW?.value || "";
  const negative = negW?.value || "";
  if (!positive && !negative) return;

  const info = getPromptInfo(displayName);
  const name = info?.name || displayName;
  const category = info?.category || "";
  const promptId = info?.id || null;

  try {
    const body = { name, category, positive, negative, auto_replace: true };
    if (promptId) body.id = promptId;

    const resp = await fetch(`${API}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (data.status === "saved") {
      showToast(`Prompt "${name}" saved`);
    } else if (data.status === "exists") {
      showToast(`Prompt "${name}" already exists (auto-replace off)`);
    }
  } catch (e) {
    console.error("ArboTools: auto-save failed", e);
  }
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

// Maps: display name → {path, name, category, id} for the current filter
let _promptPathMap = {};

async function refreshCategories(node) {
  try {
    const resp = await fetch(`${API}/prompts/categories`);
    const cats = await resp.json();
    const w = findWidget(node, "category");
    if (w) updateComboOptions(w, ["(all)", ...cats]);
  } catch (e) { /* silent */ }
}

async function refreshPrompts(node, category = "") {
  try {
    const cat = category === "(all)" ? "" : category;
    const resp = await fetch(`${API}/prompts/filter?category=${encodeURIComponent(cat)}`);
    const entries = await resp.json();

    _promptPathMap = {};
    const displayNames = ["(none)"];
    for (const e of entries) {
      _promptPathMap[e.display] = e;
      displayNames.push(e.display);
    }

    const w = findWidget(node, "prompt");
    if (w) {
      updateComboOptions(w, displayNames);
      if (w.value && w.value !== "(none)" && !displayNames.includes(w.value)) {
        w.value = "(none)";
      }
    }
  } catch (e) { /* silent */ }
}

function getPromptInfo(displayName) {
  return _promptPathMap[displayName] || null;
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
        hint: "Use \\ to create sub-categories. Start typing to see existing categories.",
        autocomplete: async (query) => {
          const cats = await getCachedCategories();
          if (!query) return cats;
          const q = query.toLowerCase();
          return cats.filter(c => c.toLowerCase().includes(q));
        },
      },
    ], async (values) => {
      if (!values.cat) return;
      await fetch(`${API}/prompts/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: values.cat }),
      });
      invalidateCategoryCache();
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
        hint: "Leave empty for root level. Start typing to see existing categories.",
        autocomplete: async (query) => {
          const cats = await getCachedCategories();
          if (!query) return cats;
          const q = query.toLowerCase();
          return cats.filter(c => c.toLowerCase().includes(q));
        },
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

      invalidateCategoryCache();
      await refreshCategories(node);

      // Set category to the new prompt's category
      const catW = findWidget(node, "category");
      if (catW && cat) catW.value = cat;

      await refreshPrompts(node, cat || "(all)");

      // Select the new prompt (by name only, not full path)
      const promptW = findWidget(node, "prompt");
      if (promptW) promptW.value = values.name;

      // Clear text fields for new prompt
      const posW = findWidget(node, "positive");
      const negW = findWidget(node, "negative");
      if (posW) posW.value = "";
      if (negW) negW.value = "";

      node.setDirtyCanvas(true);
    });
  });

  // ── Reorder widgets ──
  const order = ["category", addCatBtn.name, "prompt", newPromptBtn.name,
                  "auto_save", "positive", "negative"];
  node.widgets.sort((a, b) => {
    const ai = order.indexOf(a.name);
    const bi = order.indexOf(b.name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // ── Filter prompts when category changes ──
  const catW = findWidget(node, "category");
  if (catW) {
    const origCat = catW.callback;
    catW.callback = async function(value) {
      if (origCat) origCat.call(this, value);
      await refreshPrompts(node, value);
      // Reset prompt selection
      const promptW = findWidget(node, "prompt");
      if (promptW) promptW.value = "(none)";
      node.setDirtyCanvas(true);
      app.graph.setDirtyCanvas(true, true);
    };
    // Initial filter on node load
    setTimeout(() => refreshPrompts(node, catW.value), 100);
  }

  // ── Auto-load on prompt change ──
  const promptW = findWidget(node, "prompt");
  if (promptW) {
    const orig = promptW.callback;
    promptW.callback = async function(value) {
      if (orig) orig.call(this, value);
      if (value && value !== "(none)") {
        const info = getPromptInfo(value);
        if (info) {
          await loadPrompt(node, info.path);
        }
      }
    };
  }

  // ── Auto-save on text change (debounced) ──
  const posW = findWidget(node, "positive");
  const negW = findWidget(node, "negative");
  for (const w of [posW, negW]) {
    if (!w) continue;
    const origCb = w.callback;
    w.callback = function(value) {
      if (origCb) origCb.call(this, value);
      scheduleAutoSave(node);
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
