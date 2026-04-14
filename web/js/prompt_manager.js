/**
 * Arbo Tools — Prompt Manager frontend.
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const API = "/arbo-tools";

// ── Styles ──────────────────────────────────────────────────────────

const STYLE = document.createElement("style");
STYLE.textContent = `
  .arbo-popup-overlay { position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center; }
  .arbo-popup { background:#1e1e2e;border:1px solid #555;border-radius:10px;padding:20px;min-width:320px;max-width:420px;font-family:-apple-system,sans-serif;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,0.6); }
  .arbo-popup h3 { margin:0 0 14px;font-size:14px;color:#fff; }
  .arbo-popup label { display:block;font-size:11px;color:#888;margin-bottom:4px;margin-top:10px; }
  .arbo-popup input { width:100%;box-sizing:border-box;padding:8px 10px;background:#2a2a3a;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:13px;outline:none; }
  .arbo-popup input:focus { border-color:#4ecdc4; }
  .arbo-popup .hint { font-size:10px;color:#666;margin-top:3px; }
  .arbo-popup .buttons { display:flex;gap:8px;justify-content:flex-end;margin-top:16px; }
  .arbo-popup button { padding:6px 16px;border-radius:6px;border:none;font-size:12px;cursor:pointer; }
  .arbo-popup .btn-cancel { background:#333;color:#aaa; }
  .arbo-popup .btn-ok { background:#4ecdc4;color:#1e1e2e;font-weight:600; }
  .arbo-popup .field-wrap { position:relative; }
  .arbo-autocomplete { position:absolute;left:0;right:0;top:100%;background:#2a2a3a;border:1px solid #555;border-top:none;border-radius:0 0 6px 6px;max-height:150px;overflow-y:auto;z-index:10; }
  .arbo-autocomplete .ac-item { padding:6px 10px;font-size:12px;color:#ccc;cursor:pointer; }
  .arbo-autocomplete .ac-item:hover,.arbo-autocomplete .ac-item.active { background:#333;color:#4ecdc4; }
  .arbo-autocomplete .ac-new { padding:6px 10px;font-size:11px;color:#888;border-top:1px solid #333;font-style:italic; }
  .arbo-toast { position:fixed;bottom:24px;right:24px;z-index:100001;background:#1e1e2e;border:1px solid #4ecdc4;border-radius:8px;padding:10px 18px;font-family:-apple-system,sans-serif;font-size:12px;color:#4ecdc4;opacity:0;transform:translateY(10px);transition:opacity .2s,transform .2s;pointer-events:none; }
  .arbo-toast.show { opacity:1;transform:translateY(0); }
  .arbo-picker { position:fixed;z-index:100000;background:#1e1e2e;border:1px solid #555;border-radius:8px;padding:4px 0;min-width:260px;max-width:400px;max-height:300px;display:flex;flex-direction:column;box-shadow:0 8px 24px rgba(0,0,0,0.6);font-family:-apple-system,sans-serif; }
  .arbo-picker-search { margin:6px 8px;padding:6px 10px;background:#2a2a3a;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:12px;outline:none;box-sizing:border-box;width:calc(100% - 16px); }
  .arbo-picker-search:focus { border-color:#4ecdc4; }
  .arbo-picker-list { flex:1;overflow-y:auto;padding:2px 0; }
  .arbo-picker-item { padding:5px 12px;font-size:12px;color:#ccc;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .arbo-picker-item:hover { background:#2a2a3a;color:#fff; }
  .arbo-picker-item.sel { color:#4ecdc4;background:#252536; }
  .arbo-picker-overlay { position:fixed;inset:0;z-index:99999; }
`;

// ── State ───────────────────────────────────────────────────────────

let _cachedCategories = null;
let _promptPathMap = {};
let _toastEl = null, _toastTimer = null;
const _saveTimers = new WeakMap();

// ── Helpers ─────────────────────────────────────────────────────────

function findWidget(node, name) { return node.widgets?.find(w => w.name === name); }

function showToast(msg) {
  if (!_toastEl) { _toastEl = document.createElement("div"); _toastEl.className = "arbo-toast"; document.body.appendChild(_toastEl); }
  _toastEl.textContent = msg; _toastEl.classList.add("show");
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => _toastEl.classList.remove("show"), 2000);
}

async function getCachedCategories() {
  if (!_cachedCategories) { try { _cachedCategories = await (await fetch(`${API}/prompts/categories`)).json(); } catch { _cachedCategories = []; } }
  return _cachedCategories;
}
function invalidateCategoryCache() { _cachedCategories = null; }

// ── Autocomplete ────────────────────────────────────────────────────

function attachAutocomplete(input, getSuggestions) {
  let dd = null, idx = -1;
  function close() { if (dd) { dd.remove(); dd = null; } idx = -1; }
  async function update() {
    const q = input.value.trim(); const s = await getSuggestions(q); close();
    if (!s.length && !q) return;
    dd = document.createElement("div"); dd.className = "arbo-autocomplete";
    s.forEach(t => { const i = document.createElement("div"); i.className = "ac-item"; i.textContent = t; i.addEventListener("mousedown", e => { e.preventDefault(); input.value = t; close(); }); dd.appendChild(i); });
    if (q && !s.some(x => x.toLowerCase() === q.toLowerCase())) { const n = document.createElement("div"); n.className = "ac-new"; n.textContent = `↵ Create "${q}"`; dd.appendChild(n); }
    input.parentElement.appendChild(dd);
  }
  input.addEventListener("input", update); input.addEventListener("focus", update); input.addEventListener("blur", () => setTimeout(close, 200));
  input.addEventListener("keydown", e => { if (!dd) return; const items = dd.querySelectorAll(".ac-item"); if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); items.forEach((it, i) => it.classList.toggle("active", i === idx)); } else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); items.forEach((it, i) => it.classList.toggle("active", i === idx)); } else if (e.key === "Tab" && idx >= 0) { e.preventDefault(); input.value = items[idx].textContent; close(); } });
}

// ── Popup ───────────────────────────────────────────────────────────

function showPopup(title, fields, onConfirm) {
  const ov = document.createElement("div"); ov.className = "arbo-popup-overlay";
  let html = ""; for (const f of fields) html += `<label>${f.label}</label><div class="field-wrap"><input type="text" id="arbo-popup-${f.id}" value="${f.value || ""}" placeholder="${f.placeholder || ""}"></div>${f.hint ? `<div class="hint">${f.hint}</div>` : ""}`;
  ov.innerHTML = `<div class="arbo-popup"><h3>${title}</h3>${html}<div class="buttons"><button class="btn-cancel">Cancel</button><button class="btn-ok">OK</button></div></div>`;
  document.body.appendChild(ov);
  for (const f of fields) { if (f.autocomplete) { const inp = ov.querySelector(`#arbo-popup-${f.id}`); if (inp) attachAutocomplete(inp, f.autocomplete); } }
  const fi = ov.querySelector("input"); if (fi) setTimeout(() => fi.focus(), 50);
  ov.querySelectorAll("input").forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter" && !ov.querySelector(".arbo-autocomplete")) ov.querySelector(".btn-ok").click(); if (e.key === "Escape") ov.remove(); }));
  ov.querySelector(".btn-cancel").onclick = () => ov.remove();
  ov.querySelector(".btn-ok").onclick = () => { const v = {}; for (const f of fields) v[f.id] = ov.querySelector(`#arbo-popup-${f.id}`).value.trim(); ov.remove(); onConfirm(v); };
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
}

// ── Custom combo widget (drawn on canvas) ───────────────────────────

function addCustomComboWidget(node, name, defaultValue, getOptions, onSelected) {
  const widget = {
    type: "custom",
    name: name,
    value: defaultValue,
    options: {},
    y: 0,
    _height: 26,

    draw(ctx, node, widgetWidth, posY, height) {
      this.y = posY;
      this._height = height;
      const margin = 16;
      const w = widgetWidth - margin * 2;

      // Background
      ctx.fillStyle = "#353542";
      ctx.beginPath();
      ctx.roundRect(margin, posY, w, height, 5);
      ctx.fill();

      // Border
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label (left, dimmed)
      ctx.fillStyle = "#999";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("prompt", margin + 8, posY + height / 2);

      // Value (right of label)
      ctx.fillStyle = "#e0e0e0";
      ctx.font = "12px -apple-system, sans-serif";
      const labelWidth = ctx.measureText("prompt").width + 16;
      const maxTextWidth = w - labelWidth - 28;
      let displayText = this.value || "(none)";
      // Truncate if too long
      while (ctx.measureText(displayText).width > maxTextWidth && displayText.length > 3) {
        displayText = displayText.slice(0, -4) + "...";
      }
      ctx.fillText(displayText, margin + labelWidth, posY + height / 2);

      // Arrow ▼
      ctx.fillStyle = "#888";
      ctx.textAlign = "right";
      ctx.fillText("▼", margin + w - 8, posY + height / 2);
    },

    mouse(event, pos, node) {
      if (event.type === "pointerdown") {
        openPicker(node, this, getOptions, onSelected);
        return true;
      }
      return false;
    },

    computeSize(width) {
      return [width, 26];
    },

    serializeValue(nodeId, widgetIndex) {
      return this.value;
    },
  };

  node.addCustomWidget(widget);
  return widget;
}

function openPicker(node, widget, getOptions, onSelected) {
  document.querySelectorAll(".arbo-picker,.arbo-picker-overlay").forEach(el => el.remove());

  const options = getOptions();
  const current = widget.value;

  // Position: get canvas transform to place picker near the widget
  const canvas = app.canvas?.canvas || document.querySelector("canvas");
  const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
  const ds = app.canvas?.ds || {};
  const scale = ds.scale || 1;
  const ox = (ds.offset?.[0] || 0);
  const oy = (ds.offset?.[1] || 0);
  const px = rect.left + (node.pos[0] + 16 + ox) * scale;
  const py = rect.top + (node.pos[1] + (widget.y || 60) + 30 + oy) * scale;

  const overlay = document.createElement("div");
  overlay.className = "arbo-picker-overlay";

  const picker = document.createElement("div");
  picker.className = "arbo-picker";
  picker.style.left = Math.max(4, Math.min(px, window.innerWidth - 280)) + "px";
  picker.style.top = Math.max(4, Math.min(py, window.innerHeight - 310)) + "px";
  // Match the widget width
  picker.style.width = Math.max(260, (node.size?.[0] || 300) * scale - 32) + "px";

  const search = document.createElement("input");
  search.className = "arbo-picker-search";
  search.type = "text";
  search.placeholder = "Search...";
  picker.appendChild(search);

  const list = document.createElement("div");
  list.className = "arbo-picker-list";
  picker.appendChild(list);

  function render(filter = "") {
    list.innerHTML = "";
    const f = filter.toLowerCase();
    for (const opt of options) {
      if (f && !opt.toLowerCase().includes(f)) continue;
      const item = document.createElement("div");
      item.className = `arbo-picker-item${opt === current ? " sel" : ""}`;
      item.textContent = opt;
      item.onclick = () => {
        widget.value = opt;
        close();
        node.setDirtyCanvas(true, true); app.graph?.setDirtyCanvas?.(true, true);
        onSelected(opt);
      };
      list.appendChild(item);
    }
  }

  function close() { overlay.remove(); picker.remove(); }
  overlay.onclick = close;
  search.addEventListener("input", () => render(search.value));

  document.body.appendChild(overlay);
  document.body.appendChild(picker);
  render();
  setTimeout(() => search.focus(), 50);
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
    const names = ["(none)"];
    for (const e of entries) { _promptPathMap[e.display] = e; names.push(e.display); }
    node._arboFilteredPrompts = names;
  } catch { /* silent */ }
}

function getPromptInfo(displayName) { return _promptPathMap[displayName] || null; }

async function loadPromptIntoNode(node, path) {
  try {
    const data = await (await fetch(`${API}/prompts/load?path=${encodeURIComponent(path)}`)).json();
    const posW = findWidget(node, "positive"); if (posW && data.positive != null) posW.value = data.positive;
    const negW = findWidget(node, "negative"); if (negW && data.negative != null) negW.value = data.negative;
    node.setDirtyCanvas(true, true); app.graph?.setDirtyCanvas?.(true, true);
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
  const name = node._arboSelectedPrompt;
  if (!name || name === "(none)") return;
  const posW = findWidget(node, "positive");
  const negW = findWidget(node, "negative");
  const positive = posW?.value || "";
  const negative = negW?.value || "";
  if (!positive && !negative) return;
  const info = getPromptInfo(name);
  try {
    await fetch(`${API}/prompts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: info?.name || name, category: info?.category || "", positive, negative, auto_replace: true }) });
    showToast(`"${info?.name || name}" saved`);
  } catch { /* silent */ }
}

// ── Node setup ──────────────────────────────────────────────────────

function setupPromptPair(node) {
  if (!node._arboSelectedPrompt) node._arboSelectedPrompt = "(none)";
  if (!node._arboFilteredPrompts) node._arboFilteredPrompts = ["(none)"];

  // ── Custom combo for prompt selection ──
  const promptWidget = addCustomComboWidget(
    node, "prompt_selector",
    node._arboSelectedPrompt,
    () => node._arboFilteredPrompts || ["(none)"],
    async (value) => {
      node._arboSelectedPrompt = value;
      if (value && value !== "(none)") {
        const info = getPromptInfo(value);
        if (info) await loadPromptIntoNode(node, info.path);
      } else {
        const posW = findWidget(node, "positive"); if (posW) posW.value = "";
        const negW = findWidget(node, "negative"); if (negW) negW.value = "";
        node.setDirtyCanvas(true, true); app.graph?.setDirtyCanvas?.(true, true);
      }
    }
  );

  // ── Buttons ──
  const addCatBtn = node.addWidget("button", "➕ New Category", null, () => {
    showPopup("New Category", [{
      id: "cat", label: "Category path", placeholder: "e.g. Personnages\\Fantasy\\Elfes",
      hint: "Use \\ to create sub-categories.",
      autocomplete: async q => { const cats = await getCachedCategories(); return q ? cats.filter(c => c.toLowerCase().includes(q.toLowerCase())) : cats; },
    }], async v => {
      if (!v.cat) return;
      await fetch(`${API}/prompts/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: v.cat }) });
      invalidateCategoryCache(); await refreshCategories(node);
      const catW = findWidget(node, "category"); if (catW) catW.value = v.cat;
      node.setDirtyCanvas(true, true); app.graph?.setDirtyCanvas?.(true, true);
    });
  });

  const newPromptBtn = node.addWidget("button", "📝 New Prompt", null, () => {
    const catW = findWidget(node, "category");
    const currentCat = catW?.value !== "(all)" ? catW?.value || "" : "";
    showPopup("New Prompt", [
      { id: "name", label: "Prompt name", placeholder: "e.g. Chamane v1" },
      { id: "cat", label: "Category", value: currentCat, placeholder: "e.g. Personnages\\Fantasy",
        autocomplete: async q => { const cats = await getCachedCategories(); return q ? cats.filter(c => c.toLowerCase().includes(q.toLowerCase())) : cats; },
      },
    ], async v => {
      if (!v.name) return;
      await fetch(`${API}/prompts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v.name, category: v.cat || "", positive: "", negative: "" }) });
      invalidateCategoryCache(); await refreshCategories(node);
      const catW = findWidget(node, "category"); if (catW && v.cat) catW.value = v.cat;
      await refreshPrompts(node, v.cat || "(all)");
      node._arboSelectedPrompt = v.name;
      promptWidget.value = v.name;
      const posW = findWidget(node, "positive"); if (posW) posW.value = "";
      const negW = findWidget(node, "negative"); if (negW) negW.value = "";
      node.setDirtyCanvas(true, true); app.graph?.setDirtyCanvas?.(true, true);
    });
  });

  // ── Reorder ──
  const order = ["category", addCatBtn.name, "prompt_selector", newPromptBtn.name, "auto_save", "positive", "negative"];
  node.widgets.sort((a, b) => {
    const ai = order.indexOf(a.name); const bi = order.indexOf(b.name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // ── Category change ──
  const catW = findWidget(node, "category");
  if (catW) {
    const origCat = catW.callback;
    catW.callback = async function(value) {
      if (origCat) origCat.call(this, value);
      await refreshPrompts(node, value);
      node._arboSelectedPrompt = "(none)";
      promptWidget.value = "(none)";
      const posW = findWidget(node, "positive"); if (posW) posW.value = "";
      const negW = findWidget(node, "negative"); if (negW) negW.value = "";
      node.setDirtyCanvas(true, true); app.graph?.setDirtyCanvas?.(true, true);
    };
  }

  // ── Auto-save on text edit ──
  for (const wn of ["positive", "negative"]) {
    const w = findWidget(node, wn);
    if (!w) continue;
    const origCb = w.callback;
    w.callback = function(value) { if (origCb) origCb.call(this, value); scheduleAutoSave(node); };
  }

  // ── Persist selected prompt across save/load ──
  const origSerialize = node.onSerialize;
  node.onSerialize = function(o) {
    if (origSerialize) origSerialize.call(this, o);
    o._arboSelectedPrompt = node._arboSelectedPrompt || "(none)";
  };
  const origConfigure = node.onConfigure;
  node.onConfigure = function(o) {
    if (origConfigure) origConfigure.call(this, o);
    if (o._arboSelectedPrompt) {
      node._arboSelectedPrompt = o._arboSelectedPrompt;
      promptWidget.value = o._arboSelectedPrompt;
    }
  };

  // ── Initial load ──
  setTimeout(async () => {
    await refreshCategories(node);
    await refreshPrompts(node, catW?.value || "(all)");
    if (node._arboSelectedPrompt && node._arboSelectedPrompt !== "(none)") {
      promptWidget.value = node._arboSelectedPrompt;
      const info = getPromptInfo(node._arboSelectedPrompt);
      if (info) await loadPromptIntoNode(node, info.path);
    }
    node.setDirtyCanvas(true, true); app.graph?.setDirtyCanvas?.(true, true);
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
