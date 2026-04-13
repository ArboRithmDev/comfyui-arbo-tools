/**
 * Prompt Studio — Complete panel with treeview, editor, drag & drop.
 * Single-file build (ComfyUI loads JS files independently, not as ES modules).
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const PS_API = "/arbo-tools";

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
};

// ══════════════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════════════

function psPrompt(title, defaultValue = "", placeholder = "") {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "ps-modal-overlay";
    ov.innerHTML = `<div class="ps-modal"><h3>${title}</h3><input type="text" class="ps-input" value="${defaultValue}" placeholder="${placeholder}"><div class="ps-modal-buttons"><button class="ps-btn ps-btn-cancel">Cancel</button><button class="ps-btn ps-btn-ok">OK</button></div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector("input");
    setTimeout(() => inp.focus(), 50);
    const ok = () => { const v = inp.value.trim(); ov.remove(); resolve(v || null); };
    const cancel = () => { ov.remove(); resolve(null); };
    ov.querySelector(".ps-btn-ok").onclick = ok;
    ov.querySelector(".ps-btn-cancel").onclick = cancel;
    inp.onkeydown = e => { if (e.key === "Enter") ok(); if (e.key === "Escape") cancel(); };
    ov.onclick = e => { if (e.target === ov) cancel(); };
  });
}

function psConfirm(message) {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "ps-modal-overlay";
    ov.innerHTML = `<div class="ps-modal"><h3>Confirm</h3><p style="color:#ccc;font-size:13px;margin:10px 0">${message}</p><div class="ps-modal-buttons"><button class="ps-btn ps-btn-cancel">Cancel</button><button class="ps-btn ps-btn-danger">Delete</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector(".ps-btn-danger").onclick = () => { ov.remove(); resolve(true); };
    ov.querySelector(".ps-btn-cancel").onclick = () => { ov.remove(); resolve(false); };
    ov.onclick = e => { if (e.target === ov) { ov.remove(); resolve(false); } };
  });
}

function psFolderPicker(title, folders, excludePath = "") {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "ps-modal-overlay";
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
// CONTEXT MENU
// ══════════════════════════════════════════════════════════════════════

function psContextMenu(e, items) {
  // Remove existing
  document.querySelectorAll(".ps-context-menu, .ps-context-overlay").forEach(el => el.remove());
  const overlay = document.createElement("div");
  overlay.className = "ps-context-overlay";
  const menu = document.createElement("div");
  menu.className = "ps-context-menu";
  for (const item of items) {
    if (item.separator) { const s = document.createElement("div"); s.className = "ps-ctx-separator"; menu.appendChild(s); continue; }
    const d = document.createElement("div");
    d.className = `ps-ctx-item${item.danger ? " danger" : ""}`;
    d.textContent = item.label;
    d.onclick = () => { overlay.remove(); menu.remove(); item.action(); };
    menu.appendChild(d);
  }
  menu.style.left = Math.min(e.pageX, window.innerWidth - 180) + "px";
  menu.style.top = Math.min(e.pageY, window.innerHeight - items.length * 32) + "px";
  overlay.onclick = () => { overlay.remove(); menu.remove(); };
  document.body.appendChild(overlay);
  document.body.appendChild(menu);
}

// ══════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════

let _psToast = null, _psToastTimer = null;
function psToast(msg) {
  if (!_psToast) { _psToast = document.createElement("div"); _psToast.className = "ps-toast"; document.body.appendChild(_psToast); }
  _psToast.textContent = msg;
  _psToast.classList.add("show");
  clearTimeout(_psToastTimer);
  _psToastTimer = setTimeout(() => _psToast.classList.remove("show"), 2000);
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
  }

  toggle() {
    if (this.panel) { this.panel.remove(); this.panel = null; return; }
    this.open();
  }

  async open() {
    this.panel = document.createElement("div");
    this.panel.className = "ps-panel";
    this.panel.innerHTML = `
      <div class="ps-header">
        <h2>Prompt Studio</h2>
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
        <div class="ps-editor">
          <div class="ps-editor-empty">Select a prompt to edit</div>
        </div>
      </div>
    `;
    document.body.appendChild(this.panel);

    this.panel.querySelector(".ps-close").onclick = () => this.toggle();
    this.panel.querySelector("#ps-new-folder").onclick = () => this._newFolder("");
    this.panel.querySelector("#ps-new-prompt").onclick = () => this._newPrompt("");

    const treeEl = this.panel.querySelector("#ps-tree");
    // Root drop target
    treeEl.addEventListener("dragover", e => { if (e.target === treeEl) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } });
    treeEl.addEventListener("drop", e => { if (e.target === treeEl) this._handleDrop(e, ""); });
    // Root right-click
    treeEl.addEventListener("contextmenu", e => {
      if (e.target === treeEl) { e.preventDefault(); psContextMenu(e, [
        { label: "New Folder", action: () => this._newFolder("") },
        { label: "New Prompt", action: () => this._newPrompt("") },
      ]); }
    });

    await this.refreshTree();
  }

  // ── Tree ────────────────────────────────────────────────────────

  async refreshTree() {
    const data = await psApi.getTree();
    this.treeData = data.tree || [];
    this.renderTree();
  }

  renderTree() {
    const container = this.panel?.querySelector("#ps-tree");
    if (!container) return;
    container.innerHTML = "";
    this._renderNodes(container, this.treeData, 0);
  }

  _renderNodes(parent, nodes, depth) {
    for (const node of nodes) {
      const row = document.createElement("div");
      row.className = `ps-tree-row${node.path === this.selectedPath ? " selected" : ""}`;
      row.style.paddingLeft = (depth * 16 + 8) + "px";
      row.draggable = true;

      if (node.type === "folder") {
        const expanded = this.expandedCats.has(node.path);
        row.innerHTML = `<span class="ps-tree-toggle">${expanded ? "▼" : "▶"}</span><span class="ps-tree-icon">📁</span><span class="ps-tree-label">${node.name}</span>`;
        row.onclick = () => { if (expanded) this.expandedCats.delete(node.path); else this.expandedCats.add(node.path); this.renderTree(); };
        row.oncontextmenu = e => { e.preventDefault(); this._folderMenu(e, node); };
        // Drop target
        row.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; row.classList.add("ps-drag-over"); });
        row.addEventListener("dragleave", () => row.classList.remove("ps-drag-over"));
        row.addEventListener("drop", e => this._handleDrop(e, node.path));
        // Drag source
        row.addEventListener("dragstart", e => { e.dataTransfer.setData("application/ps-path", node.path); e.dataTransfer.setData("application/ps-type", "folder"); e.dataTransfer.effectAllowed = "move"; row.classList.add("ps-dragging"); });
        row.addEventListener("dragend", () => row.classList.remove("ps-dragging"));

        parent.appendChild(row);
        if (expanded && node.children) this._renderNodes(parent, node.children, depth + 1);
      } else {
        row.innerHTML = `<span class="ps-tree-toggle"></span><span class="ps-tree-icon">📝</span><span class="ps-tree-label">${node.name}</span>`;
        row.onclick = () => { this.selectedPath = node.path; this.renderTree(); this.loadPrompt(node.path); };
        row.oncontextmenu = e => { e.preventDefault(); this._promptMenu(e, node); };
        row.addEventListener("dragstart", e => { e.dataTransfer.setData("application/ps-path", node.path); e.dataTransfer.setData("application/ps-type", "prompt"); e.dataTransfer.effectAllowed = "move"; row.classList.add("ps-dragging"); });
        row.addEventListener("dragend", () => row.classList.remove("ps-dragging"));
        parent.appendChild(row);
      }
    }
  }

  // ── Drag & drop ─────────────────────────────────────────────────

  async _handleDrop(e, destFolder) {
    e.preventDefault();
    e.currentTarget?.classList?.remove("ps-drag-over");
    const srcPath = e.dataTransfer.getData("application/ps-path");
    const srcType = e.dataTransfer.getData("application/ps-type");
    if (!srcPath || srcPath === destFolder) return;
    if (srcType === "prompt") await psApi.movePrompt(srcPath, destFolder);
    else if (srcType === "folder") await psApi.moveCategory(srcPath, destFolder);
    await this.refreshTree();
  }

  // ── Context menus ───────────────────────────────────────────────

  _folderMenu(e, node) {
    psContextMenu(e, [
      { label: "New Prompt", action: () => this._newPrompt(node.path) },
      { label: "New Subfolder", action: () => this._newFolder(node.path) },
      { separator: true },
      { label: "Rename", action: () => this._renameCategory(node) },
      { label: "Move to...", action: () => this._moveCategoryTo(node) },
      { separator: true },
      { label: "Delete", danger: true, action: () => this._deleteCategory(node) },
    ]);
  }

  _promptMenu(e, node) {
    psContextMenu(e, [
      { label: "Rename", action: () => this._renamePrompt(node) },
      { label: "Move to...", action: () => this._movePromptTo(node) },
      { separator: true },
      { label: "Delete", danger: true, action: () => this._deletePrompt(node) },
    ]);
  }

  // ── Actions ─────────────────────────────────────────────────────

  async _newFolder(parent) {
    const name = await psPrompt("New Folder", "", "Folder name...");
    if (!name) return;
    await psApi.addCategory(parent ? `${parent}\\${name}` : name);
    if (parent) this.expandedCats.add(parent);
    await this.refreshTree();
  }

  async _newPrompt(category) {
    const name = await psPrompt("New Prompt", "", "Prompt name...");
    if (!name) return;
    await psApi.savePrompt(name, category, "", "");
    if (category) this.expandedCats.add(category);
    this.selectedPath = category ? `${category}\\${name}` : name;
    await this.refreshTree();
    this.loadPrompt(this.selectedPath);
  }

  async _renamePrompt(node) {
    const newName = await psPrompt("Rename Prompt", node.name);
    if (!newName || newName === node.name) return;
    await psApi.renamePrompt(node.path, newName);
    await this.refreshTree();
  }

  async _renameCategory(node) {
    const newName = await psPrompt("Rename Folder", node.name);
    if (!newName || newName === node.name) return;
    await psApi.renameCategory(node.path, newName);
    await this.refreshTree();
  }

  async _deletePrompt(node) {
    if (!await psConfirm(`Delete prompt "${node.name}"?`)) return;
    await psApi.deletePrompt(node.path);
    if (this.selectedPath === node.path) this._showEmpty();
    await this.refreshTree();
  }

  async _deleteCategory(node) {
    if (!await psConfirm(`Delete folder "${node.name}" and all contents?`)) return;
    await psApi.deleteCategory(node.path);
    await this.refreshTree();
  }

  async _movePromptTo(node) {
    const cats = await psApi.listCategories();
    const dest = await psFolderPicker("Move prompt to...", cats);
    if (dest === null) return;
    await psApi.movePrompt(node.path, dest);
    await this.refreshTree();
  }

  async _moveCategoryTo(node) {
    const cats = await psApi.listCategories();
    const dest = await psFolderPicker("Move folder to...", cats, node.path);
    if (dest === null) return;
    await psApi.moveCategory(node.path, dest);
    await this.refreshTree();
  }

  // ── Editor ──────────────────────────────────────────────────────

  async loadPrompt(path) {
    if (!path) { this._showEmpty(); return; }
    this.selectedPath = path;
    const data = await psApi.loadPrompt(path);
    if (data.error) { this._showEmpty(); return; }

    const parts = path.split("\\");
    const name = parts.pop();
    const cat = parts.join("\\");

    const editor = this.panel.querySelector(".ps-editor");
    editor.innerHTML = `
      <div class="ps-editor-header">
        <span class="ps-editor-title">${name}</span>
        ${cat ? `<span class="ps-editor-cat">${cat}</span>` : ""}
      </div>
      <div class="ps-editor-body">
        <div class="ps-field"><div class="ps-field-label">Positive</div><textarea class="ps-textarea positive" id="ps-pos" placeholder="Positive prompt...">${data.positive || ""}</textarea></div>
        <div class="ps-field"><div class="ps-field-label">Negative</div><textarea class="ps-textarea negative" id="ps-neg" placeholder="Negative prompt...">${data.negative || ""}</textarea></div>
      </div>
    `;

    const posEl = editor.querySelector("#ps-pos");
    const negEl = editor.querySelector("#ps-neg");
    for (const el of [posEl, negEl]) {
      el.addEventListener("input", () => {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
          await psApi.savePrompt(name, cat, posEl.value, negEl.value);
          psToast(`"${name}" saved`);
        }, 400);
      });
    }
  }

  _showEmpty() {
    this.selectedPath = null;
    const ed = this.panel?.querySelector(".ps-editor");
    if (ed) ed.innerHTML = `<div class="ps-editor-empty">Select a prompt to edit</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════

const PS_STYLE = document.createElement("style");
PS_STYLE.textContent = `
  .ps-panel { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:900px;height:600px;max-width:90vw;max-height:85vh;background:#1e1e2e;border:1px solid #444;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.6);font-family:-apple-system,sans-serif;color:#e0e0e0;display:flex;flex-direction:column;z-index:10000;overflow:hidden; }
  .ps-header { display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #333;background:#252536; }
  .ps-header h2 { margin:0;font-size:15px;font-weight:600;color:#fff; }
  .ps-close { background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px; }
  .ps-close:hover { color:#fff;background:#333; }
  .ps-body { display:flex;flex:1;overflow:hidden; }
  .ps-sidebar { width:280px;min-width:220px;border-right:1px solid #333;display:flex;flex-direction:column;overflow:hidden; }
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
  .ps-editor { flex:1;display:flex;flex-direction:column;overflow:hidden; }
  .ps-editor-empty { flex:1;display:flex;align-items:center;justify-content:center;color:#555;font-size:13px; }
  .ps-editor-header { padding:10px 16px;border-bottom:1px solid #2a2a3a;display:flex;align-items:center;gap:8px; }
  .ps-editor-title { font-size:13px;font-weight:600;color:#fff; }
  .ps-editor-cat { font-size:11px;color:#666; }
  .ps-editor-body { flex:1;display:flex;flex-direction:column;overflow:hidden; }
  .ps-field { flex:1;display:flex;flex-direction:column;overflow:hidden; }
  .ps-field-label { padding:6px 16px 2px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0; }
  .ps-textarea { flex:1;margin:0 12px 8px;padding:10px;background:#2a2a3a;border:1px solid #3a3a4a;border-radius:6px;color:#e0e0e0;font-family:inherit;font-size:13px;resize:none;outline:none;line-height:1.5; }
  .ps-textarea:focus { border-color:#4ecdc4; }
  .ps-textarea.negative { border-color:#444; }
  .ps-textarea.negative:focus { border-color:#f87171; }
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

    // Add button to ComfyUI menu
    const addButton = () => {
      if (document.querySelector("#ps-open-btn")) return;
      const menuBar = document.querySelector(".comfyui-menu") || document.querySelector("header");
      const btn = document.createElement("button");
      btn.id = "ps-open-btn";
      btn.textContent = "📝 Prompts";
      btn.title = "Open Prompt Studio";
      btn.onclick = () => studio.toggle();
      if (menuBar) {
        btn.className = "ps-menu-btn";
        btn.style.cssText = "background:none;border:none;color:#aaa;cursor:pointer;font-size:13px;padding:4px 8px;";
        menuBar.appendChild(btn);
      } else {
        btn.style.cssText = "position:fixed;top:8px;right:8px;z-index:9999;background:#252536;border:1px solid #444;border-radius:6px;color:#aaa;padding:6px 12px;cursor:pointer;font-size:12px;font-family:-apple-system,sans-serif;";
        document.body.appendChild(btn);
      }
    };
    addButton();
    // Re-add if menu rebuilds
    new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
  },
});
