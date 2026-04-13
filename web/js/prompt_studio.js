/**
 * Prompt Studio — Main panel with treeview and editor.
 *
 * Opens as a floating panel (like MCP Hub) with:
 * - Left: treeview with categories and prompts
 * - Right: positive/negative editor
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

import { PromptTree } from "./prompt_tree.js";
import * as api from "./prompt_api.js";

// ── Styles ──────────────────────────────────────────────────────────

const STYLE = document.createElement("style");
STYLE.textContent = `
  /* ── Panel ── */
  .ps-panel {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 900px; height: 600px; max-width: 90vw; max-height: 85vh;
    background: #1e1e2e; border: 1px solid #444; border-radius: 12px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.6);
    font-family: -apple-system, sans-serif; color: #e0e0e0;
    display: flex; flex-direction: column; z-index: 10000;
    overflow: hidden;
  }
  .ps-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid #333;
    background: #252536;
  }
  .ps-header h2 { margin: 0; font-size: 15px; font-weight: 600; color: #fff; }
  .ps-close { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
  .ps-close:hover { color: #fff; background: #333; }
  .ps-body { display: flex; flex: 1; overflow: hidden; }

  /* ── Sidebar (tree) ── */
  .ps-sidebar {
    width: 280px; min-width: 220px; border-right: 1px solid #333;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .ps-sidebar-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px; border-bottom: 1px solid #2a2a3a;
  }
  .ps-sidebar-header span { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .ps-sidebar-actions { display: flex; gap: 4px; }
  .ps-sidebar-actions button {
    background: #333; border: none; color: #aaa; padding: 3px 8px;
    border-radius: 4px; font-size: 11px; cursor: pointer;
  }
  .ps-sidebar-actions button:hover { background: #444; color: #4ecdc4; }
  .ps-tree-container { flex: 1; overflow-y: auto; padding: 4px 0; }

  /* ── Tree ── */
  .ps-tree-row {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px; cursor: pointer; font-size: 12px;
    border-radius: 4px; margin: 1px 4px; user-select: none;
    transition: background 0.1s;
  }
  .ps-tree-row:hover { background: #2a2a3a; }
  .ps-tree-row.selected { background: #333; color: #4ecdc4; }
  .ps-tree-row.ps-drag-over { background: #236699; outline: 2px dashed #4ecdc4; }
  .ps-tree-row.ps-dragging { opacity: 0.4; }
  .ps-tree-icon { font-size: 10px; flex-shrink: 0; width: 14px; text-align: center; }
  .ps-tree-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Editor ── */
  .ps-editor {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
  }
  .ps-editor-empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: #555; font-size: 13px;
  }
  .ps-editor-header {
    padding: 10px 16px; border-bottom: 1px solid #2a2a3a;
    display: flex; align-items: center; justify-content: space-between;
  }
  .ps-editor-title { font-size: 13px; font-weight: 600; color: #fff; }
  .ps-editor-cat { font-size: 11px; color: #666; margin-left: 8px; }
  .ps-editor-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .ps-field { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .ps-field-label {
    padding: 6px 16px 2px; font-size: 10px; color: #888;
    text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0;
  }
  .ps-textarea {
    flex: 1; margin: 0 12px 8px; padding: 10px;
    background: #2a2a3a; border: 1px solid #3a3a4a; border-radius: 6px;
    color: #e0e0e0; font-family: inherit; font-size: 13px;
    resize: none; outline: none; line-height: 1.5;
  }
  .ps-textarea:focus { border-color: #4ecdc4; }
  .ps-textarea.negative { border-color: #444; }
  .ps-textarea.negative:focus { border-color: #f87171; }

  /* ── Context menu ── */
  .ps-context-overlay { position: fixed; inset: 0; z-index: 10001; }
  .ps-context-menu {
    position: fixed; z-index: 10002;
    background: #252536; border: 1px solid #555; border-radius: 8px;
    padding: 4px 0; min-width: 160px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }
  .ps-ctx-item {
    padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background 0.1s;
  }
  .ps-ctx-item:hover { background: #333; color: #4ecdc4; }
  .ps-ctx-item.danger { color: #f87171; }
  .ps-ctx-item.danger:hover { background: #3a2020; }
  .ps-ctx-separator { height: 1px; background: #333; margin: 3px 0; }

  /* ── Modals ── */
  .ps-modal-overlay {
    position: fixed; inset: 0; z-index: 10003;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
  }
  .ps-modal {
    background: #1e1e2e; border: 1px solid #555; border-radius: 10px;
    padding: 20px; min-width: 320px; max-width: 420px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }
  .ps-modal h3 { margin: 0 0 14px; font-size: 14px; color: #fff; }
  .ps-input {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    background: #2a2a3a; border: 1px solid #444; border-radius: 6px;
    color: #e0e0e0; font-size: 13px; outline: none;
  }
  .ps-input:focus { border-color: #4ecdc4; }
  .ps-modal-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .ps-btn { padding: 6px 16px; border-radius: 6px; border: none; font-size: 12px; cursor: pointer; }
  .ps-btn-cancel { background: #333; color: #aaa; }
  .ps-btn-cancel:hover { background: #444; }
  .ps-btn-ok { background: #4ecdc4; color: #1e1e2e; font-weight: 600; }
  .ps-btn-ok:hover { background: #3dbdb5; }
  .ps-btn-danger { background: #f87171; color: #fff; font-weight: 600; }
  .ps-btn-danger:hover { background: #e05555; }
  .ps-folder-list { max-height: 200px; overflow-y: auto; border: 1px solid #333; border-radius: 6px; margin-top: 8px; }
  .ps-folder-item { padding: 6px 10px; font-size: 12px; cursor: pointer; }
  .ps-folder-item:hover { background: #333; }
  .ps-folder-item.selected { background: #236699; color: #fff; }

  /* ── Menu bar button ── */
  .ps-menu-btn {
    background: none; border: none; color: #aaa; cursor: pointer;
    font-size: 13px; padding: 4px 8px;
  }
  .ps-menu-btn:hover { color: #4ecdc4; }
`;

// ── Panel class ─────────────────────────────────────────────────────

class PromptStudio {
  constructor() {
    this.panel = null;
    this.tree = null;
    this.currentPath = null;
    this.saveTimer = null;
  }

  toggle() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
      return;
    }
    this.open();
  }

  async open() {
    this.panel = document.createElement("div");
    this.panel.className = "ps-panel";
    this.panel.innerHTML = `
      <div class="ps-header">
        <h2>Prompt Studio</h2>
        <button class="ps-close" id="ps-close">✕</button>
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
          <div class="ps-editor-empty" id="ps-editor-empty">Select a prompt to edit</div>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Close
    this.panel.querySelector("#ps-close").onclick = () => this.toggle();

    // Tree
    const treeContainer = this.panel.querySelector("#ps-tree");
    this.tree = new PromptTree(treeContainer, (path) => this.loadPrompt(path));
    await this.tree.refresh();

    // Toolbar
    this.panel.querySelector("#ps-new-folder").onclick = () => this.tree._newFolder("");
    this.panel.querySelector("#ps-new-prompt").onclick = () => this.tree._newPrompt("");

    // Drop on root tree area
    treeContainer.addEventListener("dragover", (e) => {
      if (e.target === treeContainer) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
    });
    treeContainer.addEventListener("drop", (e) => {
      if (e.target === treeContainer) this.tree._handleDrop(e, "");
    });

    // Right-click on empty tree space
    treeContainer.addEventListener("contextmenu", (e) => {
      if (e.target === treeContainer) {
        e.preventDefault();
        this.tree.ctx.show(e, [
          { label: "New Folder", action: () => this.tree._newFolder("") },
          { label: "New Prompt", action: () => this.tree._newPrompt("") },
        ]);
      }
    });
  }

  async loadPrompt(path) {
    if (!path) {
      this._showEmpty();
      return;
    }
    this.currentPath = path;

    const data = await api.loadPrompt(path);
    if (data.error) {
      this._showEmpty();
      return;
    }

    const editor = this.panel.querySelector(".ps-editor");
    const parts = path.split("\\");
    const name = parts.pop();
    const cat = parts.join("\\");

    editor.innerHTML = `
      <div class="ps-editor-header">
        <div>
          <span class="ps-editor-title">${name}</span>
          ${cat ? `<span class="ps-editor-cat">${cat}</span>` : ""}
        </div>
      </div>
      <div class="ps-editor-body">
        <div class="ps-field">
          <div class="ps-field-label">Positive</div>
          <textarea class="ps-textarea positive" id="ps-positive" placeholder="Positive prompt...">${data.positive || ""}</textarea>
        </div>
        <div class="ps-field">
          <div class="ps-field-label">Negative</div>
          <textarea class="ps-textarea negative" id="ps-negative" placeholder="Negative prompt...">${data.negative || ""}</textarea>
        </div>
      </div>
    `;

    // Auto-save on edit (debounced 400ms)
    const posEl = editor.querySelector("#ps-positive");
    const negEl = editor.querySelector("#ps-negative");
    for (const el of [posEl, negEl]) {
      el.addEventListener("input", () => this._scheduleAutosave(name, cat, posEl, negEl));
    }
  }

  _showEmpty() {
    this.currentPath = null;
    const editor = this.panel?.querySelector(".ps-editor");
    if (editor) editor.innerHTML = `<div class="ps-editor-empty">Select a prompt to edit</div>`;
  }

  _scheduleAutosave(name, cat, posEl, negEl) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      await api.savePrompt(name, cat, posEl.value, negEl.value);
      // Toast
      this._toast(`"${name}" saved`);
    }, 400);
  }

  _toast(msg) {
    let t = document.querySelector(".ps-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "ps-toast";
      t.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:10010;background:#1e1e2e;border:1px solid #4ecdc4;border-radius:8px;padding:8px 16px;font-size:12px;color:#4ecdc4;opacity:0;transition:opacity 0.2s;pointer-events:none;font-family:-apple-system,sans-serif;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    setTimeout(() => { t.style.opacity = "0"; }, 2000);
  }
}

// ── Extension registration ──────────────────────────────────────────

const studio = new PromptStudio();

app.registerExtension({
  name: "ArboTools.PromptStudio",

  setup() {
    document.head.appendChild(STYLE);

    // Add button to ComfyUI menu bar
    const menuBar = document.querySelector(".comfyui-menu") ||
                    document.querySelector("header") ||
                    document.querySelector(".comfy-menu");

    if (menuBar) {
      const btn = document.createElement("button");
      btn.className = "ps-menu-btn";
      btn.textContent = "📝 Prompts";
      btn.title = "Open Prompt Studio";
      btn.onclick = () => studio.toggle();
      menuBar.appendChild(btn);
    } else {
      // Fallback: add floating button
      const btn = document.createElement("button");
      btn.style.cssText = "position:fixed;top:8px;right:200px;z-index:9999;background:#252536;border:1px solid #444;border-radius:6px;color:#aaa;padding:6px 12px;cursor:pointer;font-size:12px;font-family:-apple-system,sans-serif;";
      btn.textContent = "📝 Prompts";
      btn.onclick = () => studio.toggle();
      document.body.appendChild(btn);
    }
  },
});
