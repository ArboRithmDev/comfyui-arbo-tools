/**
 * Arbo Tools — Prompt Manager frontend.
 *
 * Handles the PromptPair node: category filtering, prompt loading,
 * auto-save, and popup dialogs.
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const API = "/arbo-tools";

// ── Styles ──────────────────────────────────────────────────────────

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
  .arbo-popup h3 { margin: 0 0 14px; font-size: 14px; color: #fff; }
  .arbo-popup label { display: block; font-size: 11px; color: #888; margin-bottom: 4px; margin-top: 10px; }
  .arbo-popup input {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    background: #2a2a3a; border: 1px solid #444; border-radius: 6px;
    color: #e0e0e0; font-size: 13px; outline: none;
  }
  .arbo-popup input:focus { border-color: #4ecdc4; }
  .arbo-popup .hint { font-size: 10px; color: #666; margin-top: 3px; }
  .arbo-popup .buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .arbo-popup button { padding: 6px 16px; border-radius: 6px; border: none; font-size: 12px; cursor: pointer; }
  .arbo-popup .btn-cancel { background: #333; color: #aaa; }
  .arbo-popup .btn-ok { background: #4ecdc4; color: #1e1e2e; font-weight: 600; }
  .arbo-popup .field-wrap { position: relative; }
  .arbo-autocomplete {
    position: absolute; left: 0; right: 0; top: 100%;
    background: #2a2a3a; border: 1px solid #555; border-top: none;
    border-radius: 0 0 6px 6px; max-height: 150px; overflow-y: auto; z-index: 10;
  }
  .arbo-autocomplete .ac-item { padding: 6px 10px; font-size: 12px; color: #ccc; cursor: pointer; }
  .arbo-autocomplete .ac-item:hover, .arbo-autocomplete .ac-item.active { background: #333; color: #4ecdc4; }
  .arbo-autocomplete .ac-new { padding: 6px 10px; font-size: 11px; color: #888; border-top: 1px solid #333; font-style: italic; }
  .arbo-toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 100001;
    background: #1e1e2e; border: 1px solid #4ecdc4; border-radius: 8px;
    padding: 10px 18px; font-family: -apple-system, sans-serif;
    font-size: 12px; color: #4ecdc4; opacity: 0; transform: translateY(10px);
    transition: opacity 0.2s, transform 0.2s; pointer-events: none;
  }
  .arbo-toast.show { opacity: 1; transform: translateY(0); }
`;

// ── State ───────────────────────────────────────────────────────────

let _cachedCategories = null;
let _promptPathMap = {};
let _toastEl = null, _toastTimer = null;
const _saveTimers = new WeakMap();

// ── Helpers ─────────────────────────────────────────────────────────

function findWidget(node, name) {
  return node.widgets?.find(w => w.name === name);
}

function showToast(msg) {
  if (!_toastEl) { _toastEl = document.createElement("div"); _toastEl.className = "arbo-toast"; document.body.appendChild(_toastEl); }
  _toastEl.textContent = msg; _toastEl.classList.add("show");
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => _toastEl.classList.remove("show"), 2000);
}

async function getCachedCategories() {
  if (!_cachedCategories) {
    try { _cachedCategories = await (await fetch(`${API}/prompts/categories`)).json(); }
    catch { _cachedCategories = []; }
  }
  return _cachedCategories;
}

function invalidateCategoryCache() { _cachedCategories = null; }

// ── Autocomplete ────────────────────────────────────────────────────

function attachAutocomplete(input, getSuggestions) {
  let dropdown = null, activeIdx = -1;
  function close() { if (dropdown) { dropdown.remove(); dropdown = null; } activeIdx = -1; }
  async function update() {
    const q = input.value.trim(); const suggestions = await getSuggestions(q);
    close(); if (!suggestions.length && !q) return;
    dropdown = document.createElement("div"); dropdown.className = "arbo-autocomplete";
    suggestions.forEach((s, i) => {
      const item = document.createElement("div"); item.className = "ac-item"; item.textContent = s;
      item.addEventListener("mousedown", e => { e.preventDefault(); input.value = s; close(); input.dispatchEvent(new Event("input")); });
      dropdown.appendChild(item);
    });
    if (q && !suggestions.some(s => s.toLowerCase() === q.toLowerCase())) {
      const n = document.createElement("div"); n.className = "ac-new"; n.textContent = `↵ Create "${q}"`; dropdown.appendChild(n);
    }
    input.parentElement.appendChild(dropdown);
  }
  input.addEventListener("input", update); input.addEventListener("focus", update);
  input.addEventListener("blur", () => setTimeout(close, 200));
  input.addEventListener("keydown", e => {
    if (!dropdown) return; const items = dropdown.querySelectorAll(".ac-item");
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); items.forEach((it, i) => it.classList.toggle("active", i === activeIdx)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); items.forEach((it, i) => it.classList.toggle("active", i === activeIdx)); }
    else if (e.key === "Tab" && activeIdx >= 0) { e.preventDefault(); input.value = items[activeIdx].textContent; close(); }
  });
}

// ── Popup ───────────────────────────────────────────────────────────

function showPopup(title, fields, onConfirm) {
  const ov = document.createElement("div"); ov.className = "arbo-popup-overlay";
  let html = "";
  for (const f of fields) {
    html += `<label>${f.label}</label><div class="field-wrap"><input type="text" id="arbo-popup-${f.id}" value="${f.value || ""}" placeholder="${f.placeholder || ""}"></div>${f.hint ? `<div class="hint">${f.hint}</div>` : ""}`;
  }
  ov.innerHTML = `<div class="arbo-popup"><h3>${title}</h3>${html}<div class="buttons"><button class="btn-cancel">Cancel</button><button class="btn-ok">OK</button></div></div>`;
  document.body.appendChild(ov);
  for (const f of fields) { if (f.autocomplete) { const inp = ov.querySelector(`#arbo-popup-${f.id}`); if (inp) attachAutocomplete(inp, f.autocomplete); } }
  const firstInput = ov.querySelector("input"); if (firstInput) setTimeout(() => firstInput.focus(), 50);
  ov.querySelectorAll("input").forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter" && !ov.querySelector(".arbo-autocomplete")) ov.querySelector(".btn-ok").click(); if (e.key === "Escape") ov.remove(); }));
  ov.querySelector(".btn-cancel").onclick = () => ov.remove();
  ov.querySelector(".btn-ok").onclick = () => { const v = {}; for (const f of fields) v[f.id] = ov.querySelector(`#arbo-popup-${f.id}`).value.trim(); ov.remove(); onConfirm(v); };
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
}

// ── Prompt filtering ────────────────────────────────────────────────

async function refreshCategories(node) {
  try {
    const cats = await (await fetch(`${API}/prompts/categories`)).json();
    const w = findWidget(node, "category");
    if (w?.options) w.options.values = ["(all)", ...cats];
  } catch { /* silent */ }
}

async function refreshPrompts(node, category = "") {
  try {
    const cat = category === "(all)" ? "" : category;
    const entries = await (await fetch(`${API}/prompts/filter?category=${encodeURIComponent(cat)}`)).json();

    _promptPathMap = {};
    const displayNames = ["(none)"];
    for (const e of entries) { _promptPathMap[e.display] = e; displayNames.push(e.display); }

    const w = findWidget(node, "prompt");
    if (w) {
      // Store filtered options for this node
      if (!node._arboFilteredPrompts) node._arboFilteredPrompts = [];
      node._arboFilteredPrompts = displayNames;
      if (w.options) w.options.values = displayNames;
      if (w.value && w.value !== "(none)" && !displayNames.includes(w.value)) w.value = "(none)";
      node.setDirtyCanvas(true);
    }
  } catch { /* silent */ }
}

function getPromptInfo(displayName) { return _promptPathMap[displayName] || null; }

async function loadPromptIntoNode(node, path) {
  try {
    const resp = await fetch(`${API}/prompts/load?path=${encodeURIComponent(path)}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const posW = findWidget(node, "positive");
    const negW = findWidget(node, "negative");
    if (posW && data.positive != null) posW.value = data.positive;
    if (negW && data.negative != null) negW.value = data.negative;
    node.setDirtyCanvas(true);
  } catch { /* silent */ }
}

// ── Auto-save ───────────────────────────────────────────────────────

function scheduleAutoSave(node) {
  clearTimeout(_saveTimers.get(node));
  _saveTimers.set(node, setTimeout(() => doAutoSave(node), 400));
}

async function doAutoSave(node) {
  const autoSaveW = findWidget(node, "auto_save");
  if (!autoSaveW?.value) return;
  if (window._psStudioOpenPath) return;

  const promptW = findWidget(node, "prompt");
  const posW = findWidget(node, "positive");
  const negW = findWidget(node, "negative");
  const name = promptW?.value;
  if (!name || name === "(none)") return;
  const positive = posW?.value || "";
  const negative = negW?.value || "";
  if (!positive && !negative) return;

  const info = getPromptInfo(name);
  try {
    await fetch(`${API}/prompts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: info?.name || name, category: info?.category || "", positive, negative, auto_replace: true }),
    });
    showToast(`"${info?.name || name}" saved`);
  } catch { /* silent */ }
}

// ── Node setup ──────────────────────────────────────────────────────

function setupPromptPair(node) {
  // ── Intercept prompt combo to inject filtered values ──
  const promptW = findWidget(node, "prompt");
  if (promptW) {
    // Override the combo's getOptions to always return our filtered list
    const origSerialize = promptW.serializeValue;
    Object.defineProperty(promptW, 'options', {
      get() { return this._options || {}; },
      set(v) {
        this._options = v;
        // Ensure our filtered values are always used
        if (node._arboFilteredPrompts && v) {
          v.values = node._arboFilteredPrompts;
        }
      },
    });
    if (!promptW._options) promptW._options = promptW.options || {};
  }

  // ── "+" button after category ──
  const addCatBtn = node.addWidget("button", "➕ New Category", null, () => {
    showPopup("New Category", [{
      id: "cat", label: "Category path",
      placeholder: "e.g. Personnages\\Fantasy\\Elfes",
      hint: "Use \\ to create sub-categories.",
      autocomplete: async q => { const cats = await getCachedCategories(); return q ? cats.filter(c => c.toLowerCase().includes(q.toLowerCase())) : cats; },
    }], async v => {
      if (!v.cat) return;
      await fetch(`${API}/prompts/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: v.cat }) });
      invalidateCategoryCache(); await refreshCategories(node);
      const catW = findWidget(node, "category"); if (catW) catW.value = v.cat;
      node.setDirtyCanvas(true);
    });
  });

  // ── "New" button after prompt ──
  const newPromptBtn = node.addWidget("button", "📝 New Prompt", null, () => {
    const catW = findWidget(node, "category");
    const currentCat = catW?.value !== "(all)" ? catW?.value || "" : "";
    showPopup("New Prompt", [
      { id: "name", label: "Prompt name", placeholder: "e.g. Chamane v1" },
      { id: "cat", label: "Category", value: currentCat, placeholder: "e.g. Personnages\\Fantasy",
        hint: "Leave empty for root level.",
        autocomplete: async q => { const cats = await getCachedCategories(); return q ? cats.filter(c => c.toLowerCase().includes(q.toLowerCase())) : cats; },
      },
    ], async v => {
      if (!v.name) return;
      await fetch(`${API}/prompts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v.name, category: v.cat || "", positive: "", negative: "" }) });
      invalidateCategoryCache(); await refreshCategories(node);
      const catW = findWidget(node, "category"); if (catW && v.cat) catW.value = v.cat;
      await refreshPrompts(node, v.cat || "(all)");
      const pw = findWidget(node, "prompt"); if (pw) pw.value = v.name;
      const posW = findWidget(node, "positive"); if (posW) posW.value = "";
      const negW = findWidget(node, "negative"); if (negW) negW.value = "";
      node.setDirtyCanvas(true);
    });
  });

  // ── Reorder widgets ──
  const order = ["category", addCatBtn.name, "prompt", newPromptBtn.name, "auto_save", "positive", "negative"];
  node.widgets.sort((a, b) => {
    const ai = order.indexOf(a.name); const bi = order.indexOf(b.name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // ── Category change → filter prompts ──
  const catW = findWidget(node, "category");
  if (catW) {
    const origCat = catW.callback;
    catW.callback = async function(value) {
      if (origCat) origCat.call(this, value);
      await refreshPrompts(node, value);
      const pw = findWidget(node, "prompt"); if (pw) pw.value = "(none)";
      const posW = findWidget(node, "positive"); if (posW) posW.value = "";
      const negW = findWidget(node, "negative"); if (negW) negW.value = "";
      node.setDirtyCanvas(true);
    };
  }

  // ── Prompt change → load content ──
  if (promptW) {
    const origPrompt = promptW.callback;
    promptW.callback = async function(value) {
      if (origPrompt) origPrompt.call(this, value);
      if (value && value !== "(none)") {
        const info = getPromptInfo(value);
        if (info) await loadPromptIntoNode(node, info.path);
      } else {
        const posW = findWidget(node, "positive"); if (posW) posW.value = "";
        const negW = findWidget(node, "negative"); if (negW) negW.value = "";
        node.setDirtyCanvas(true);
      }
    };
  }

  // ── Auto-save on text edit ──
  for (const wn of ["positive", "negative"]) {
    const w = findWidget(node, wn);
    if (!w) continue;
    const origCb = w.callback;
    w.callback = function(value) { if (origCb) origCb.call(this, value); scheduleAutoSave(node); };
  }

  // ── Initial load ──
  setTimeout(async () => {
    await refreshCategories(node);
    const catW = findWidget(node, "category");
    await refreshPrompts(node, catW?.value || "(all)");
    const pw = findWidget(node, "prompt");
    if (pw?.value && pw.value !== "(none)") {
      const info = getPromptInfo(pw.value);
      if (info) await loadPromptIntoNode(node, info.path);
      else { pw.value = "(none)"; }
    }
    node.setDirtyCanvas(true);
  }, 300);
}

// ── Extension ───────────────────────────────────────────────────────

app.registerExtension({
  name: "ArboTools.PromptManager",
  setup() { document.head.appendChild(STYLE); },
  async nodeCreated(node) {
    if (node.comfyClass === "ArboTools_PromptPair") setupPromptPair(node);
  },
});
