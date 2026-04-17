/**
 * Prompt Studio — Panel with treeview, editor, enhancer, and config.
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const PS_API = "/arbo-tools";

// ══════════════════════════════════════════════════════════════════════
// DEFAULT SYSTEM PROMPTS
// ══════════════════════════════════════════════════════════════════════

const ENHANCE_LEVELS = {
  light: { label: "Light", desc: "Reformulate and clarify" },
  medium: { label: "Medium", desc: "Enrich with details, style, lighting" },
  heavy: { label: "Heavy", desc: "Creative rewrite" },
};

const MODEL_FAMILIES = {
  "sd15": { label: "SD 1.5", promptStyle: "tags" },
  "sdxl": { label: "SDXL", promptStyle: "tags" },
  "illustrious": { label: "Illustrious", promptStyle: "mixed" },
  "pony": { label: "Pony", promptStyle: "mixed" },
  "flux": { label: "Flux", promptStyle: "natural" },
  "qwen": { label: "Qwen (Video)", promptStyle: "natural" },
  "wan": { label: "WAN (Video)", promptStyle: "natural" },
  "audio": { label: "Audio", promptStyle: "natural" },
};

const DEFAULT_SYSTEM_PROMPTS = {
  tags: `You are a prompt engineer for Stable Diffusion image generation models.
Improve the user's prompt using comma-separated tags and weighted keywords.
Use (keyword:weight) syntax for emphasis. Include quality tags, style descriptors,
lighting, composition, and relevant details. Keep it concise and effective.
Output ONLY the improved prompt, no explanation.`,

  mixed: `You are a prompt engineer for anime/illustration image generation models.
These models understand both booru-style tags AND natural language descriptions.
Improve the user's prompt by enriching details: character features, clothing,
pose, expression, environment, lighting, composition, and artistic style.
You can mix tags and descriptive sentences. Use (keyword:weight) for emphasis.
Output ONLY the improved prompt, no explanation.`,

  natural: `You are a prompt engineer for modern image/video generation models.
These models work best with natural language descriptions, NOT tags.
Improve the user's prompt with vivid, detailed descriptions: subject, action,
environment, mood, lighting, camera angle, composition, colors, textures.
Write flowing, descriptive sentences. Do NOT use tags or weight syntax.
Output ONLY the improved prompt, no explanation.`,
};

// ══════════════════════════════════════════════════════════════════════
// CONFIG STATE
// ══════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  provider: "ollama",       // "local_gguf" | "ollama" | "openai" | "anthropic"
  model: "",
  api_key: "",
  ollama_url: "http://localhost:11434",
  content_mode: "safe",     // "safe" | "unrestricted"
  model_family: "sdxl",
  enhance_level: "medium",
  system_prompt_override: "",
};

let psConfig = { ...DEFAULT_CONFIG };

async function loadConfig() {
  try {
    const data = await psApi.fetch(`${PS_API}/studio/config`);
    if (!data.error) psConfig = { ...DEFAULT_CONFIG, ...data };
  } catch { /* use defaults */ }
}

async function saveConfig() {
  await psApi.fetch(`${PS_API}/studio/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(psConfig),
  });
}

function getSystemPrompt() {
  if (psConfig.system_prompt_override) return psConfig.system_prompt_override;
  const family = MODEL_FAMILIES[psConfig.model_family];
  return DEFAULT_SYSTEM_PROMPTS[family?.promptStyle || "natural"];
}

function isCloudProvider(provider) {
  return provider === "openai" || provider === "anthropic";
}

function canUseProvider(provider) {
  if (psConfig.content_mode === "unrestricted" && isCloudProvider(provider)) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════════════════════

const psApi = {
  async fetch(url, opts = {}) { return (await fetch(url, opts)).json(); },
  listCategories() { return this.fetch(`${PS_API}/prompts/categories`); },
  addCategory(path) { return this.fetch(`${PS_API}/prompts/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }); },
  getTree() { return this.fetch(`${PS_API}/prompts/tree`); },
  loadPrompt(path) { return this.fetch(`${PS_API}/prompts/load?path=${encodeURIComponent(path)}`); },
  savePrompt(name, category, positive, negative) { return this.fetch(`${PS_API}/prompts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, category, positive, negative }) }); },
  deletePrompt(path) { return this.fetch(`${PS_API}/prompts/${encodeURIComponent(path)}`, { method: "DELETE" }); },
  renamePrompt(oldPath, newName) { return this.fetch(`${PS_API}/prompts/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ old_path: oldPath, new_name: newName }) }); },
  movePrompt(srcPath, destCat) { return this.fetch(`${PS_API}/prompts/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src_path: srcPath, dest_category: destCat }) }); },
  renameCategory(oldPath, newName) { return this.fetch(`${PS_API}/prompts/categories/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ old_path: oldPath, new_name: newName }) }); },
  deleteCategory(path) { return this.fetch(`${PS_API}/prompts/categories/${encodeURIComponent(path)}`, { method: "DELETE" }); },
  moveCategory(src, dest) { return this.fetch(`${PS_API}/prompts/categories/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src_path: src, dest_path: dest }) }); },
  enhance(positive, negative, level) {
    return this.fetch(`${PS_API}/studio/enhance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positive, negative, level, config: psConfig }),
    });
  },
  listLLMs(provider) { return this.fetch(`${PS_API}/studio/models${provider ? "?provider=" + provider : ""}`); },
};

// ══════════════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════════════

function psPrompt(title, defaultValue = "", placeholder = "") {
  return new Promise(resolve => {
    const ov = document.createElement("div"); ov.className = "ps-modal-overlay";
    ov.innerHTML = `<div class="ps-modal"><h3>${title}</h3><input type="text" class="ps-input" value="${defaultValue}" placeholder="${placeholder}"><div class="ps-modal-buttons"><button class="ps-btn ps-btn-cancel">Cancel</button><button class="ps-btn ps-btn-ok">OK</button></div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector("input"); setTimeout(() => inp.focus(), 50);
    const ok = () => { ov.remove(); resolve(inp.value.trim() || null); };
    const cancel = () => { ov.remove(); resolve(null); };
    ov.querySelector(".ps-btn-ok").onclick = ok;
    ov.querySelector(".ps-btn-cancel").onclick = cancel;
    inp.onkeydown = e => { if (e.key === "Enter") ok(); if (e.key === "Escape") cancel(); };
    ov.onclick = e => { if (e.target === ov) cancel(); };
  });
}

function psConfirm(msg) {
  return new Promise(resolve => {
    const ov = document.createElement("div"); ov.className = "ps-modal-overlay";
    ov.innerHTML = `<div class="ps-modal"><h3>Confirm</h3><p style="color:#ccc;font-size:13px;margin:10px 0">${msg}</p><div class="ps-modal-buttons"><button class="ps-btn ps-btn-cancel">Cancel</button><button class="ps-btn ps-btn-danger">Delete</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector(".ps-btn-danger").onclick = () => { ov.remove(); resolve(true); };
    ov.querySelector(".ps-btn-cancel").onclick = () => { ov.remove(); resolve(false); };
    ov.onclick = e => { if (e.target === ov) { ov.remove(); resolve(false); } };
  });
}

function psFolderPicker(title, folders, excludePath = "") {
  return new Promise(resolve => {
    const ov = document.createElement("div"); ov.className = "ps-modal-overlay";
    let items = `<div class="ps-folder-item" data-path="" style="font-weight:600">📁 (root)</div>`;
    for (const f of [...folders].sort()) {
      if (f === excludePath || f.startsWith(excludePath + "\\")) continue;
      const depth = f.split("\\").length - 1;
      items += `<div class="ps-folder-item" data-path="${f}" style="padding-left:${depth * 20 + 10}px">📁 ${f.split("\\").pop()}</div>`;
    }
    ov.innerHTML = `<div class="ps-modal"><h3>${title}</h3><div class="ps-folder-list">${items}</div><div class="ps-modal-buttons"><button class="ps-btn ps-btn-cancel">Cancel</button><button class="ps-btn ps-btn-ok" disabled>Move</button></div></div>`;
    document.body.appendChild(ov);
    let sel = null;
    ov.querySelectorAll(".ps-folder-item").forEach(it => {
      it.onclick = () => { ov.querySelectorAll(".ps-folder-item").forEach(i => i.classList.remove("selected")); it.classList.add("selected"); sel = it.dataset.path; ov.querySelector(".ps-btn-ok").disabled = false; };
    });
    ov.querySelector(".ps-btn-ok").onclick = () => { ov.remove(); resolve(sel); };
    ov.querySelector(".ps-btn-cancel").onclick = () => { ov.remove(); resolve(null); };
    ov.onclick = e => { if (e.target === ov) { ov.remove(); resolve(null); } };
  });
}

// ══════════════════════════════════════════════════════════════════════
// CONTEXT MENU & TOAST
// ══════════════════════════════════════════════════════════════════════

function psContextMenu(e, items) {
  document.querySelectorAll(".ps-context-menu,.ps-context-overlay").forEach(el => el.remove());
  const overlay = document.createElement("div"); overlay.className = "ps-context-overlay";
  const menu = document.createElement("div"); menu.className = "ps-context-menu";
  for (const item of items) {
    if (item.separator) { const s = document.createElement("div"); s.className = "ps-ctx-separator"; menu.appendChild(s); continue; }
    const d = document.createElement("div"); d.className = `ps-ctx-item${item.danger ? " danger" : ""}`;
    d.textContent = item.label;
    d.onclick = () => { overlay.remove(); menu.remove(); item.action(); };
    menu.appendChild(d);
  }
  menu.style.left = Math.min(e.pageX, window.innerWidth - 180) + "px";
  menu.style.top = Math.min(e.pageY, window.innerHeight - items.length * 32) + "px";
  overlay.onclick = () => { overlay.remove(); menu.remove(); };
  document.body.appendChild(overlay); document.body.appendChild(menu);
}

let _psToast = null, _psToastTimer = null;
function psToast(msg) {
  if (!_psToast) { _psToast = document.createElement("div"); _psToast.className = "ps-toast"; document.body.appendChild(_psToast); }
  _psToast.textContent = msg; _psToast.classList.add("show");
  clearTimeout(_psToastTimer); _psToastTimer = setTimeout(() => _psToast.classList.remove("show"), 2000);
}

// ══════════════════════════════════════════════════════════════════════
// RESIZE
// ══════════════════════════════════════════════════════════════════════

function makeResizable(panel) {
  const MIN_W = 600, MIN_H = 400;
  const edges = [
    { cls: "ps-resize-e", cursor: "ew-resize", dx: 1, dy: 0 },
    { cls: "ps-resize-s", cursor: "ns-resize", dx: 0, dy: 1 },
    { cls: "ps-resize-se", cursor: "nwse-resize", dx: 1, dy: 1 },
    { cls: "ps-resize-w", cursor: "ew-resize", dx: -1, dy: 0 },
    { cls: "ps-resize-n", cursor: "ns-resize", dx: 0, dy: -1 },
  ];

  for (const edge of edges) {
    const handle = document.createElement("div");
    handle.className = `ps-resize ${edge.cls}`;
    handle.style.cursor = edge.cursor;
    panel.appendChild(handle);

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      const startW = rect.width, startH = rect.height;
      const startL = rect.left, startT = rect.top;

      // Switch from transform-based centering to absolute positioning
      panel.style.transform = "none";
      panel.style.left = startL + "px";
      panel.style.top = startT + "px";
      panel.style.width = startW + "px";
      panel.style.height = startH + "px";

      const onMove = (e) => {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (edge.dx === 1) panel.style.width = Math.max(MIN_W, startW + deltaX) + "px";
        if (edge.dy === 1) panel.style.height = Math.max(MIN_H, startH + deltaY) + "px";
        if (edge.dx === -1) {
          const newW = Math.max(MIN_W, startW - deltaX);
          panel.style.width = newW + "px";
          panel.style.left = (startL + startW - newW) + "px";
        }
        if (edge.dy === -1) {
          const newH = Math.max(MIN_H, startH - deltaY);
          panel.style.height = newH + "px";
          panel.style.top = (startT + startH - newH) + "px";
        }
      };
      const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // Draggable header
  const header = panel.querySelector(".ps-header");
  header.style.cursor = "move";
  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    panel.style.transform = "none";
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    const startX = e.clientX - rect.left, startY = e.clientY - rect.top;
    const onMove = (e) => { panel.style.left = (e.clientX - startX) + "px"; panel.style.top = (e.clientY - startY) + "px"; };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// ══════════════════════════════════════════════════════════════════════
// PROMPT STUDIO
// ══════════════════════════════════════════════════════════════════════

class PromptStudio {
  constructor() {
    this.panel = null;
    this.selectedPath = null;
    this.expandedCats = new Set();
    this.treeData = [];
    this.saveTimer = null;
    this.activeTab = "editor";
    this.fontSize = 13;
  }

  toggle() {
    if (this.panel) { this.panel.remove(); this.panel = null; window._psStudioOpenPath = null; }
    else this.open();
  }

  async open() {
    await loadConfig();

    this.panel = document.createElement("div");
    this.panel.className = "ps-panel";
    this.panel.innerHTML = `
      <div class="ps-header">
        <h2>Prompt Studio</h2>
        <div class="ps-tabs">
          <button class="ps-tab active" data-tab="editor">Editor</button>
          <button class="ps-tab" data-tab="config">Config</button>
        </div>
        <button class="ps-close">✕</button>
      </div>
      <div class="ps-body">
        <div class="ps-sidebar">
          <div class="ps-sidebar-header">
            <span>Library</span>
            <div class="ps-sidebar-actions">
              <button id="ps-new-folder" title="New folder">📁+</button>
              <button id="ps-new-prompt" title="New prompt">📝+</button>
            </div>
          </div>
          <div class="ps-tree-container" id="ps-tree"></div>
        </div>
        <div class="ps-main">
          <div class="ps-tab-content active" data-tab="editor">
            <div class="ps-editor">
              <div class="ps-editor-empty">Select a prompt to edit</div>
            </div>
          </div>
          <div class="ps-tab-content" data-tab="config">
            ${this._renderConfig()}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.panel);

    // Resize + drag
    makeResizable(this.panel);

    // Close
    this.panel.querySelector(".ps-close").onclick = () => this.toggle();

    // Tabs
    this.panel.querySelectorAll(".ps-tab").forEach(tab => {
      tab.onclick = () => {
        this.panel.querySelectorAll(".ps-tab").forEach(t => t.classList.remove("active"));
        this.panel.querySelectorAll(".ps-tab-content").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        this.panel.querySelector(`.ps-tab-content[data-tab="${tab.dataset.tab}"]`).classList.add("active");
        this.activeTab = tab.dataset.tab;
      };
    });

    // Tree
    this.panel.querySelector("#ps-new-folder").onclick = () => this._newFolder("");
    this.panel.querySelector("#ps-new-prompt").onclick = () => this._newPrompt("");
    const treeEl = this.panel.querySelector("#ps-tree");
    treeEl.addEventListener("dragover", e => { if (e.target === treeEl) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } });
    treeEl.addEventListener("drop", e => { if (e.target === treeEl) this._handleDrop(e, ""); });
    treeEl.addEventListener("contextmenu", e => {
      if (e.target === treeEl) { e.preventDefault(); psContextMenu(e, [
        { label: "New Folder", action: () => this._newFolder("") },
        { label: "New Prompt", action: () => this._newPrompt("") },
      ]); }
    });

    await this.refreshTree();
    this._bindConfig();
  }

  // ── Config ──────────────────────────────────────────────────────

  _renderConfig() {
    const families = Object.entries(MODEL_FAMILIES).map(([k, v]) =>
      `<option value="${k}" ${psConfig.model_family === k ? "selected" : ""}>${v.label}</option>`
    ).join("");

    const levels = Object.entries(ENHANCE_LEVELS).map(([k, v]) =>
      `<option value="${k}" ${psConfig.enhance_level === k ? "selected" : ""}>${v.label} — ${v.desc}</option>`
    ).join("");

    const providers = [
      ["ollama", "Ollama (local)"],
      ["local_gguf", "Local GGUF"],
      ["openai", "OpenAI (cloud)"],
      ["anthropic", "Anthropic (cloud)"],
    ];

    return `
      <div class="ps-config">
        <div class="ps-config-section">
          <div class="ps-config-title">LLM Provider</div>
          <div class="ps-config-row">
            <label>Provider</label>
            <select id="ps-cfg-provider">
              ${providers.map(([k, l]) => `<option value="${k}" ${psConfig.provider === k ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="ps-config-row" id="ps-cfg-ollama-row">
            <label>Ollama URL</label>
            <input type="text" class="ps-input" id="ps-cfg-ollama-url" value="${psConfig.ollama_url}" placeholder="http://localhost:11434">
          </div>
          <div class="ps-config-row">
            <label>Model</label>
            <select id="ps-cfg-model"><option value="">Loading...</option></select>
            <button class="ps-btn ps-btn-sm" id="ps-cfg-refresh-models" title="Refresh">↻</button>
          </div>
          <div class="ps-config-row" id="ps-cfg-apikey-row" style="display:none">
            <label>API Key</label>
            <input type="password" class="ps-input" id="ps-cfg-apikey" value="${psConfig.api_key}" placeholder="sk-...">
          </div>
        </div>

        <div class="ps-config-section">
          <div class="ps-config-title">Content & Style</div>
          <div class="ps-config-row">
            <label>Content mode</label>
            <select id="ps-cfg-content">
              <option value="safe" ${psConfig.content_mode === "safe" ? "selected" : ""}>Safe</option>
              <option value="unrestricted" ${psConfig.content_mode === "unrestricted" ? "selected" : ""}>Unrestricted (local only)</option>
            </select>
          </div>
          <div id="ps-cfg-cloud-warning" class="ps-config-warning" style="display:none">
            ⚠ Cloud providers disabled in unrestricted mode
          </div>
          <div class="ps-config-row">
            <label>Target model family</label>
            <select id="ps-cfg-family">${families}</select>
          </div>
          <div class="ps-config-row">
            <label>Enhancement level</label>
            <select id="ps-cfg-level">${levels}</select>
          </div>
        </div>

        <div class="ps-config-section">
          <div class="ps-config-title">System Prompt</div>
          <div class="ps-config-hint">Leave empty to use the default for the selected model family</div>
          <textarea class="ps-textarea" id="ps-cfg-sysprompt" style="height:120px" placeholder="Custom system prompt...">${psConfig.system_prompt_override || ""}</textarea>
        </div>

        <div style="padding:0 16px 16px;text-align:right">
          <button class="ps-btn ps-btn-ok" id="ps-cfg-save">Save Config</button>
        </div>
      </div>
    `;
  }

  _bindConfig() {
    const p = this.panel;
    const providerEl = p.querySelector("#ps-cfg-provider");
    const contentEl = p.querySelector("#ps-cfg-content");
    const warningEl = p.querySelector("#ps-cfg-cloud-warning");
    const apikeyRow = p.querySelector("#ps-cfg-apikey-row");
    const ollamaRow = p.querySelector("#ps-cfg-ollama-row");

    const updateVisibility = () => {
      const prov = providerEl.value;
      const isCloud = isCloudProvider(prov);
      const isUnrestricted = contentEl.value === "unrestricted";
      apikeyRow.style.display = isCloud ? "" : "none";
      ollamaRow.style.display = prov === "ollama" ? "" : "none";
      warningEl.style.display = isUnrestricted ? "" : "none";

      // Disable cloud if unrestricted
      providerEl.querySelectorAll("option").forEach(opt => {
        if (isCloudProvider(opt.value)) {
          opt.disabled = isUnrestricted;
        }
      });
      if (isUnrestricted && isCloud) {
        providerEl.value = "ollama";
      }
    };

    providerEl.onchange = updateVisibility;
    contentEl.onchange = updateVisibility;
    updateVisibility();

    // Refresh models on click and on provider change
    p.querySelector("#ps-cfg-refresh-models").onclick = () => this._refreshModels();
    providerEl.addEventListener("change", () => this._refreshModels());
    this._refreshModels();

    // Save
    p.querySelector("#ps-cfg-save").onclick = async () => {
      psConfig.provider = providerEl.value;
      psConfig.ollama_url = p.querySelector("#ps-cfg-ollama-url").value;
      psConfig.model = p.querySelector("#ps-cfg-model").value;
      psConfig.api_key = p.querySelector("#ps-cfg-apikey").value;
      psConfig.content_mode = contentEl.value;
      psConfig.model_family = p.querySelector("#ps-cfg-family").value;
      psConfig.enhance_level = p.querySelector("#ps-cfg-level").value;
      psConfig.system_prompt_override = p.querySelector("#ps-cfg-sysprompt").value;
      await saveConfig();
      psToast("Config saved");
    };
  }

  async _refreshModels() {
    const modelSelect = this.panel.querySelector("#ps-cfg-model");
    const providerEl = this.panel.querySelector("#ps-cfg-provider");
    const currentProvider = providerEl?.value || psConfig.provider;
    modelSelect.innerHTML = `<option value="">Loading...</option>`;
    try {
      const data = await psApi.listLLMs(currentProvider);
      const models = data.models || [];
      if (models.length === 0) {
        modelSelect.innerHTML = `<option value="">(no models found)</option>`;
      } else {
        modelSelect.innerHTML = models.map(m =>
          `<option value="${m.id || m.name}" ${(m.id || m.name) === psConfig.model ? "selected" : ""}>${m.name}</option>`
        ).join("");
      }
    } catch {
      modelSelect.innerHTML = `<option value="">(error loading models)</option>`;
    }
  }

  // ── Tree ────────────────────────────────────────────────────────

  async refreshTree() {
    const data = await psApi.getTree();
    this.treeData = data.tree || [];
    this.renderTree();
  }

  renderTree() {
    const c = this.panel?.querySelector("#ps-tree");
    if (!c) return;
    c.innerHTML = "";
    this._renderNodes(c, this.treeData, 0);
  }

  _renderNodes(parent, nodes, depth) {
    for (const node of nodes) {
      const row = document.createElement("div");
      row.className = `ps-tree-row${node.path === this.selectedPath ? " selected" : ""}`;
      row.style.paddingLeft = (depth * 16 + 8) + "px";
      row.draggable = true;

      if (node.type === "folder") {
        const exp = this.expandedCats.has(node.path);
        row.innerHTML = `<span class="ps-tree-toggle">${exp ? "▼" : "▶"}</span><span class="ps-tree-icon">📁</span><span class="ps-tree-label">${node.name}</span>`;
        row.onclick = () => { if (exp) this.expandedCats.delete(node.path); else this.expandedCats.add(node.path); this.renderTree(); };
        row.oncontextmenu = e => { e.preventDefault(); this._folderMenu(e, node); };
        row.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; row.classList.add("ps-drag-over"); });
        row.addEventListener("dragleave", () => row.classList.remove("ps-drag-over"));
        row.addEventListener("drop", e => this._handleDrop(e, node.path));
        row.addEventListener("dragstart", e => { e.dataTransfer.setData("application/ps-path", node.path); e.dataTransfer.setData("application/ps-type", "folder"); row.classList.add("ps-dragging"); });
        row.addEventListener("dragend", () => row.classList.remove("ps-dragging"));
        parent.appendChild(row);
        if (exp && node.children) this._renderNodes(parent, node.children, depth + 1);
      } else {
        row.innerHTML = `<span class="ps-tree-toggle"></span><span class="ps-tree-icon">📝</span><span class="ps-tree-label">${node.name}</span>`;
        row.onclick = () => { this.selectedPath = node.path; this.renderTree(); this.loadPrompt(node.path); };
        row.oncontextmenu = e => { e.preventDefault(); this._promptMenu(e, node); };
        row.addEventListener("dragstart", e => { e.dataTransfer.setData("application/ps-path", node.path); e.dataTransfer.setData("application/ps-type", "prompt"); row.classList.add("ps-dragging"); });
        row.addEventListener("dragend", () => row.classList.remove("ps-dragging"));
        parent.appendChild(row);
      }
    }
  }

  async _handleDrop(e, dest) {
    e.preventDefault(); e.currentTarget?.classList?.remove("ps-drag-over");
    const src = e.dataTransfer.getData("application/ps-path");
    const type = e.dataTransfer.getData("application/ps-type");
    if (!src || src === dest) return;
    if (type === "prompt") await psApi.movePrompt(src, dest);
    else await psApi.moveCategory(src, dest);
    await this.refreshTree();
  }

  // ── Context menus ───────────────────────────────────────────────

  _folderMenu(e, n) { psContextMenu(e, [
    { label: "New Prompt", action: () => this._newPrompt(n.path) },
    { label: "New Subfolder", action: () => this._newFolder(n.path) },
    { separator: true },
    { label: "Rename", action: () => this._renameCategory(n) },
    { label: "Move to...", action: () => this._moveCategoryTo(n) },
    { separator: true },
    { label: "Delete", danger: true, action: () => this._deleteCategory(n) },
  ]); }

  _promptMenu(e, n) { psContextMenu(e, [
    { label: "Duplicate", action: () => this._duplicatePrompt(n) },
    { label: "Rename", action: () => this._renamePrompt(n) },
    { label: "Move to...", action: () => this._movePromptTo(n) },
    { separator: true },
    { label: "Delete", danger: true, action: () => this._deletePrompt(n) },
  ]); }

  // ── Actions ─────────────────────────────────────────────────────

  async _newFolder(p) { const n = await psPrompt("New Folder", "", "Folder name..."); if (!n) return; await psApi.addCategory(p ? `${p}\\${n}` : n); if (p) this.expandedCats.add(p); await this.refreshTree(); }
  async _newPrompt(cat) { const n = await psPrompt("New Prompt", "", "Prompt name..."); if (!n) return; await psApi.savePrompt(n, cat, "", ""); if (cat) this.expandedCats.add(cat); this.selectedPath = cat ? `${cat}\\${n}` : n; await this.refreshTree(); this.loadPrompt(this.selectedPath); }
  async _duplicatePrompt(n) {
    const newName = await psPrompt("Duplicate Prompt", `${n.name} (copy)`, "New prompt name...");
    if (!newName) return;
    const data = await psApi.loadPrompt(n.path);
    if (data.error) return;
    const cat = n.path.split("\\").slice(0, -1).join("\\");
    await psApi.savePrompt(newName, cat, data.positive || "", data.negative || "");
    if (cat) this.expandedCats.add(cat);
    this.selectedPath = cat ? `${cat}\\${newName}` : newName;
    await this.refreshTree();
    this.loadPrompt(this.selectedPath);
    psToast(`"${newName}" created`);
  }
  async _renamePrompt(n) { const v = await psPrompt("Rename", n.name); if (!v || v === n.name) return; await psApi.renamePrompt(n.path, v); await this.refreshTree(); }
  async _renameCategory(n) { const v = await psPrompt("Rename", n.name); if (!v || v === n.name) return; await psApi.renameCategory(n.path, v); await this.refreshTree(); }
  async _deletePrompt(n) { if (!await psConfirm(`Delete "${n.name}"?`)) return; await psApi.deletePrompt(n.path); if (this.selectedPath === n.path) this._showEmpty(); await this.refreshTree(); }
  async _deleteCategory(n) { if (!await psConfirm(`Delete "${n.name}" and all contents?`)) return; await psApi.deleteCategory(n.path); await this.refreshTree(); }
  async _movePromptTo(n) { const cats = await psApi.listCategories(); const d = await psFolderPicker("Move to...", cats); if (d === null) return; await psApi.movePrompt(n.path, d); await this.refreshTree(); }
  async _moveCategoryTo(n) { const cats = await psApi.listCategories(); const d = await psFolderPicker("Move to...", cats, n.path); if (d === null) return; await psApi.moveCategory(n.path, d); await this.refreshTree(); }

  // ── Editor ──────────────────────────────────────────────────────

  async loadPrompt(path) {
    if (!path) { this._showEmpty(); window._psStudioOpenPath = null; return; }
    this.selectedPath = path;
    window._psStudioOpenPath = path;
    const data = await psApi.loadPrompt(path);
    if (data.error) { this._showEmpty(); return; }

    const parts = path.split("\\");
    const name = parts.pop();
    const cat = parts.join("\\");

    const editor = this.panel.querySelector(".ps-editor");
    editor.innerHTML = `
      <div class="ps-editor-header">
        <div>
          <span class="ps-editor-title">${name}</span>
          ${cat ? `<span class="ps-editor-cat">${cat}</span>` : ""}
        </div>
        <div class="ps-enhance-bar">
          <button class="ps-btn ps-btn-fontsize" id="ps-font-down" title="Decrease font size">A-</button>
          <button class="ps-btn ps-btn-fontsize" id="ps-font-up" title="Increase font size">A+</button>
          <span class="ps-separator">|</span>
          <button class="ps-btn ps-btn-fontsize" id="ps-snippet-btn" title="Insert snippet">📋</button>
          <span class="ps-separator">|</span>
          <select id="ps-enhance-level">
            ${Object.entries(ENHANCE_LEVELS).map(([k, v]) =>
              `<option value="${k}" ${psConfig.enhance_level === k ? "selected" : ""}>${v.label}</option>`
            ).join("")}
          </select>
          <button class="ps-btn ps-btn-enhance" id="ps-enhance-btn">✨ Enhance</button>
        </div>
      </div>
      <div class="ps-editor-body">
        <div class="ps-field"><div class="ps-field-label">Positive</div><textarea class="ps-textarea positive" id="ps-pos" placeholder="Positive prompt...">${data.positive || ""}</textarea></div>
        <div class="ps-field"><div class="ps-field-label">Negative</div><textarea class="ps-textarea negative" id="ps-neg" placeholder="Negative prompt...">${data.negative || ""}</textarea></div>
      </div>
    `;

    const posEl = editor.querySelector("#ps-pos");
    const negEl = editor.querySelector("#ps-neg");

    // Apply current font size
    posEl.style.fontSize = (this.fontSize || 13) + "px";
    negEl.style.fontSize = (this.fontSize || 13) + "px";

    // Auto-save + sync to widget nodes
    for (const el of [posEl, negEl]) {
      el.addEventListener("input", () => {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
          await psApi.savePrompt(name, cat, posEl.value, negEl.value);
          psToast(`"${name}" saved`);
          this._syncToWidgets(path, posEl.value, negEl.value);
        }, 400);
      });
    }

    // Font size buttons
    const fontDown = editor.querySelector("#ps-font-down");
    const fontUp = editor.querySelector("#ps-font-up");
    if (fontDown) fontDown.onclick = () => this._changeFontSize(-1);
    if (fontUp) fontUp.onclick = () => this._changeFontSize(1);

    // Snippet button
    const snippetBtn = editor.querySelector("#ps-snippet-btn");
    if (snippetBtn) snippetBtn.onclick = () => this._openSnippetPicker(posEl);

    // Enhance button
    editor.querySelector("#ps-enhance-btn").onclick = async () => {
      const btn = editor.querySelector("#ps-enhance-btn");
      const level = editor.querySelector("#ps-enhance-level").value;
      btn.textContent = "⏳ Enhancing..."; btn.disabled = true;

      try {
        const result = await psApi.enhance(posEl.value, negEl.value, level);
        if (result.error) {
          psToast(`Error: ${result.error}`);
        } else {
          if (result.positive) posEl.value = result.positive;
          if (result.negative) negEl.value = result.negative;
          await psApi.savePrompt(name, cat, posEl.value, negEl.value);
          psToast(`"${name}" enhanced & saved`);
        }
      } catch (e) {
        psToast("Enhancement failed");
      }
      btn.textContent = "✨ Enhance"; btn.disabled = false;
    };

    // Switch to editor tab
    if (this.activeTab !== "editor") {
      this.panel.querySelector('.ps-tab[data-tab="editor"]').click();
    }
  }

  _syncToWidgets(path, positive, negative) {
    // Find all PromptPair nodes and update those displaying the same prompt
    if (!app.graph) return;
    for (const node of app.graph._nodes || []) {
      if (node.comfyClass !== "ArboTools_PromptPair") continue;
      const promptW = node.widgets?.find(w => w.name === "prompt");
      if (!promptW) continue;
      // Check if this widget is showing the same prompt (by name match)
      const promptName = path.split("\\").pop();
      if (promptW.value === promptName || promptW.value === path) {
        const posW = node.widgets?.find(w => w.name === "positive");
        const negW = node.widgets?.find(w => w.name === "negative");
        if (posW) posW.value = positive;
        if (negW) negW.value = negative;
        node.setDirtyCanvas?.(true);
      }
    }
  }

  async _openSnippetPicker(targetTextarea) {
    // Fetch snippets
    let snippets = [];
    try { snippets = await psApi.fetch(`${PS_API}/snippets`); } catch { return; }
    if (!Array.isArray(snippets) || snippets.length === 0) { psToast("No snippets available"); return; }

    // Group by category
    const byCategory = {};
    for (const s of snippets) {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    }

    // Build picker
    document.querySelectorAll(".ps-snippet-picker,.ps-snippet-overlay").forEach(el => el.remove());
    const overlay = document.createElement("div"); overlay.className = "ps-snippet-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:10005;";

    const picker = document.createElement("div");
    picker.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10006;background:#1e1e2e;border:1px solid #555;border-radius:10px;padding:12px;min-width:350px;max-width:500px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.6);font-family:-apple-system,sans-serif;color:#e0e0e0;";
    picker.className = "ps-snippet-picker";

    let html = `<div style="font-size:14px;font-weight:600;margin-bottom:10px;color:#fff;">Insert Snippet</div>`;
    html += `<div style="flex:1;overflow-y:auto;">`;

    for (const [cat, items] of Object.entries(byCategory).sort()) {
      html += `<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;padding:8px 6px 4px;">${cat}</div>`;
      for (const s of items) {
        html += `<div class="ps-snippet-item" data-text="${s.text.replace(/"/g, '&quot;')}" style="padding:5px 10px;font-size:12px;cursor:pointer;border-radius:4px;margin:1px 0;">
          <div style="color:#e0e0e0;">${s.name}</div>
          <div style="color:#666;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.text}</div>
        </div>`;
      }
    }
    html += `</div>`;
    picker.innerHTML = html;

    // Click to insert
    picker.querySelectorAll(".ps-snippet-item").forEach(item => {
      item.onmouseenter = () => item.style.background = "#2a2a3a";
      item.onmouseleave = () => item.style.background = "";
      item.onclick = () => {
        const text = item.dataset.text;
        const pos = targetTextarea.selectionStart || targetTextarea.value.length;
        const before = targetTextarea.value.substring(0, pos);
        const after = targetTextarea.value.substring(pos);
        const sep = before && !before.endsWith("\n") && !before.endsWith(", ") ? ", " : "";
        targetTextarea.value = before + sep + text + after;
        targetTextarea.dispatchEvent(new Event("input", { bubbles: true }));
        overlay.remove(); picker.remove();
        psToast(`Inserted "${item.querySelector("div").textContent}"`);
      };
    });

    overlay.onclick = () => { overlay.remove(); picker.remove(); };
    document.body.appendChild(overlay);
    document.body.appendChild(picker);
  }

  _changeFontSize(delta) {
    this.fontSize = Math.max(9, Math.min(22, (this.fontSize || 13) + delta));
    const textareas = this.panel?.querySelectorAll(".ps-textarea");
    if (textareas) textareas.forEach(t => t.style.fontSize = this.fontSize + "px");
  }

  _showEmpty() {
    this.selectedPath = null;
    window._psStudioOpenPath = null;
    const ed = this.panel?.querySelector(".ps-editor");
    if (ed) ed.innerHTML = `<div class="ps-editor-empty">Select a prompt to edit</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════

const PS_STYLE = document.createElement("style");
PS_STYLE.textContent = `
  .ps-panel { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:960px;height:640px;max-width:95vw;max-height:90vh;background:#1e1e2e;border:1px solid #444;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.6);font-family:-apple-system,sans-serif;color:#e0e0e0;display:flex;flex-direction:column;z-index:10000;overflow:visible; }
  .ps-header { display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #333;background:#252536;border-radius:12px 12px 0 0;gap:12px; }
  .ps-header h2 { margin:0;font-size:15px;font-weight:600;color:#fff;white-space:nowrap; }
  .ps-tabs { display:flex;gap:2px;flex:1; }
  .ps-tab { background:none;border:none;color:#888;padding:5px 14px;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s; }
  .ps-tab:hover { color:#ccc;background:#333; }
  .ps-tab.active { color:#4ecdc4;background:#2a2a3a; }
  .ps-close { background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px; }
  .ps-close:hover { color:#fff;background:#333; }
  .ps-body { display:flex;flex:1;overflow:hidden; }
  .ps-sidebar { width:260px;min-width:200px;border-right:1px solid #333;display:flex;flex-direction:column;overflow:hidden; }
  .ps-sidebar-header { display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #2a2a3a; }
  .ps-sidebar-header span { font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px; }
  .ps-sidebar-actions { display:flex;gap:4px; }
  .ps-sidebar-actions button { background:#333;border:none;color:#aaa;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer; }
  .ps-sidebar-actions button:hover { background:#444;color:#4ecdc4; }
  .ps-tree-container { flex:1;overflow-y:auto;padding:4px 0; }
  .ps-tree-row { display:flex;align-items:center;gap:4px;padding:4px 8px;cursor:pointer;font-size:12px;border-radius:4px;margin:1px 4px;user-select:none;transition:background .1s; }
  .ps-tree-row:hover { background:#2a2a3a; }
  .ps-tree-row.selected { background:#333;color:#4ecdc4; }
  .ps-tree-row.ps-drag-over { background:#236699;outline:2px dashed #4ecdc4; }
  .ps-tree-row.ps-dragging { opacity:.4; }
  .ps-tree-toggle { font-size:9px;width:12px;text-align:center;flex-shrink:0; }
  .ps-tree-icon { font-size:11px;flex-shrink:0; }
  .ps-tree-label { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .ps-main { flex:1;display:flex;flex-direction:column;overflow:hidden; }
  .ps-tab-content { display:none;flex:1;overflow:hidden; }
  .ps-tab-content.active { display:flex;flex-direction:column; }
  .ps-editor { flex:1;display:flex;flex-direction:column;overflow:hidden; }
  .ps-editor-empty { flex:1;display:flex;align-items:center;justify-content:center;color:#555;font-size:13px; }
  .ps-editor-header { padding:8px 16px;border-bottom:1px solid #2a2a3a;display:flex;align-items:center;justify-content:space-between;gap:8px; }
  .ps-editor-title { font-size:13px;font-weight:600;color:#fff; }
  .ps-editor-cat { font-size:11px;color:#666;margin-left:6px; }
  .ps-enhance-bar { display:flex;align-items:center;gap:6px; }
  .ps-enhance-bar select { background:#2a2a3a;border:1px solid #444;border-radius:4px;color:#ccc;padding:3px 6px;font-size:11px; }
  .ps-btn-enhance { background:#4ecdc4;color:#1e1e2e;border:none;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer; }
  .ps-btn-enhance:hover { background:#3dbdb5; }
  .ps-btn-enhance:disabled { opacity:.5;cursor:wait; }
  .ps-btn-fontsize { background:#333;color:#aaa;border:none;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600; }
  .ps-btn-fontsize:hover { background:#444;color:#4ecdc4; }
  .ps-separator { color:#444;margin:0 2px; }
  .ps-editor-body { flex:1;display:flex;flex-direction:column;overflow:hidden; }
  .ps-field { flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:80px; }
  .ps-field-label { padding:6px 16px 2px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0; }
  .ps-textarea { flex:1;margin:0 12px 6px;padding:10px;background:#2a2a3a;border:1px solid #3a3a4a;border-radius:6px;color:#e0e0e0;font-family:inherit;font-size:13px;resize:none;outline:none;line-height:1.5; }
  .ps-textarea:focus { border-color:#4ecdc4; }
  .ps-textarea.negative { border-color:#444; }
  .ps-textarea.negative:focus { border-color:#f87171; }

  /* Config */
  .ps-config { overflow-y:auto;padding:8px 0; }
  .ps-config-section { padding:8px 16px 12px;border-bottom:1px solid #2a2a3a; }
  .ps-config-title { font-size:12px;font-weight:600;color:#fff;margin-bottom:8px; }
  .ps-config-hint { font-size:10px;color:#666;margin-bottom:6px; }
  .ps-config-row { display:flex;align-items:center;gap:8px;margin-bottom:6px; }
  .ps-config-row label { font-size:11px;color:#888;min-width:110px;flex-shrink:0; }
  .ps-config-row select, .ps-config-row input { flex:1;background:#2a2a3a;border:1px solid #444;border-radius:4px;color:#ccc;padding:5px 8px;font-size:12px;outline:none; }
  .ps-config-row select:focus, .ps-config-row input:focus { border-color:#4ecdc4; }
  .ps-config-warning { font-size:11px;color:#f87171;padding:4px 0 6px;display:flex;align-items:center;gap:4px; }
  .ps-btn-sm { background:#333;border:none;color:#aaa;padding:4px 8px;border-radius:4px;font-size:12px;cursor:pointer; }
  .ps-btn-sm:hover { background:#444;color:#4ecdc4; }

  /* Resize handles */
  .ps-resize { position:absolute;z-index:10; }
  .ps-resize-e { right:-4px;top:12px;bottom:12px;width:8px; }
  .ps-resize-s { bottom:-4px;left:12px;right:12px;height:8px; }
  .ps-resize-se { right:-4px;bottom:-4px;width:16px;height:16px;cursor:nwse-resize; }
  .ps-resize-w { left:-4px;top:12px;bottom:12px;width:8px; }
  .ps-resize-n { top:-4px;left:12px;right:12px;height:8px; }

  /* Context, modals, toast — same as before */
  .ps-context-overlay { position:fixed;inset:0;z-index:10001; }
  .ps-context-menu { position:fixed;z-index:10002;background:#252536;border:1px solid #555;border-radius:8px;padding:4px 0;min-width:160px;box-shadow:0 4px 20px rgba(0,0,0,0.5); }
  .ps-ctx-item { padding:6px 14px;font-size:12px;cursor:pointer;transition:background .1s; }
  .ps-ctx-item:hover { background:#333;color:#4ecdc4; }
  .ps-ctx-item.danger { color:#f87171; }
  .ps-ctx-item.danger:hover { background:#3a2020; }
  .ps-ctx-separator { height:1px;background:#333;margin:3px 0; }
  .ps-modal-overlay { position:fixed;inset:0;z-index:10003;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center; }
  .ps-modal { background:#1e1e2e;border:1px solid #555;border-radius:10px;padding:20px;min-width:320px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.6); }
  .ps-modal h3 { margin:0 0 14px;font-size:14px;color:#fff; }
  .ps-input { width:100%;box-sizing:border-box;padding:8px 10px;background:#2a2a3a;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:13px;outline:none; }
  .ps-input:focus { border-color:#4ecdc4; }
  .ps-modal-buttons { display:flex;gap:8px;justify-content:flex-end;margin-top:16px; }
  .ps-btn { padding:6px 16px;border-radius:6px;border:none;font-size:12px;cursor:pointer; }
  .ps-btn-cancel { background:#333;color:#aaa; }
  .ps-btn-cancel:hover { background:#444; }
  .ps-btn-ok { background:#4ecdc4;color:#1e1e2e;font-weight:600; }
  .ps-btn-ok:hover { background:#3dbdb5; }
  .ps-btn-danger { background:#f87171;color:#fff;font-weight:600; }
  .ps-btn-danger:hover { background:#e05555; }
  .ps-folder-list { max-height:200px;overflow-y:auto;border:1px solid #333;border-radius:6px;margin-top:8px; }
  .ps-folder-item { padding:6px 10px;font-size:12px;cursor:pointer; }
  .ps-folder-item:hover { background:#333; }
  .ps-folder-item.selected { background:#236699;color:#fff; }
  .ps-toast { position:fixed;bottom:24px;right:24px;z-index:10010;background:#1e1e2e;border:1px solid #4ecdc4;border-radius:8px;padding:8px 16px;font-size:12px;color:#4ecdc4;font-family:-apple-system,sans-serif;opacity:0;transform:translateY(10px);transition:opacity .2s,transform .2s;pointer-events:none; }
  .ps-toast.show { opacity:1;transform:translateY(0); }
`;

// ══════════════════════════════════════════════════════════════════════
// REGISTRATION
// ══════════════════════════════════════════════════════════════════════

const studio = new PromptStudio();

app.registerExtension({
  name: "ArboTools.PromptStudio",
  setup() {
    document.head.appendChild(PS_STYLE);
    const addButton = () => {
      if (document.querySelector("#ps-open-btn")) return;
      const menuBar = document.querySelector(".comfyui-menu") || document.querySelector("header");
      const btn = document.createElement("button"); btn.id = "ps-open-btn";
      btn.textContent = "📝 Prompts"; btn.title = "Open Prompt Studio";
      btn.onclick = () => studio.toggle();
      if (menuBar) { btn.style.cssText = "background:none;border:none;color:#aaa;cursor:pointer;font-size:13px;padding:4px 8px;"; menuBar.appendChild(btn); }
      else { btn.style.cssText = "position:fixed;top:8px;right:8px;z-index:9999;background:#252536;border:1px solid #444;border-radius:6px;color:#aaa;padding:6px 12px;cursor:pointer;font-size:12px;font-family:-apple-system,sans-serif;"; document.body.appendChild(btn); }
    };
    addButton();
    new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
  },
});
