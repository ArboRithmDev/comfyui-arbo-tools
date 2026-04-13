/**
 * Prompt Studio — Treeview with drag & drop.
 */

import * as api from "./prompt_api.js";
import { ContextMenu } from "./prompt_context.js";
import { Modal } from "./prompt_modal.js";

export class PromptTree {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.ctx = new ContextMenu();
    this.modal = new Modal();
    this.selectedPath = null;
    this.expandedCats = new Set();
    this.treeData = [];
  }

  async refresh() {
    const data = await api.getTreeData();
    this.treeData = data.tree || [];
    this.render();
  }

  render() {
    this.container.innerHTML = "";
    const tree = document.createElement("div");
    tree.className = "ps-tree";
    this._renderNodes(tree, this.treeData, 0);
    this.container.appendChild(tree);
  }

  _renderNodes(parent, nodes, depth) {
    for (const node of nodes) {
      const row = document.createElement("div");
      row.className = `ps-tree-row${node.path === this.selectedPath ? " selected" : ""}`;
      row.style.paddingLeft = (depth * 16 + 8) + "px";
      row.dataset.path = node.path;
      row.dataset.type = node.type;
      row.draggable = true;

      if (node.type === "folder") {
        const expanded = this.expandedCats.has(node.path);
        row.innerHTML = `<span class="ps-tree-icon">${expanded ? "▼" : "▶"}</span><span class="ps-tree-icon">📁</span><span class="ps-tree-label">${node.name}</span>`;

        row.addEventListener("click", (e) => {
          if (expanded) {
            this.expandedCats.delete(node.path);
          } else {
            this.expandedCats.add(node.path);
          }
          this.render();
        });

        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this._showFolderMenu(e, node);
        });

        // Drag & drop — folder as drop target
        row.addEventListener("dragover", (e) => {
          const srcPath = e.dataTransfer.types.includes("application/ps-path") ? "yes" : "";
          if (srcPath) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; row.classList.add("ps-drag-over"); }
        });
        row.addEventListener("dragleave", () => row.classList.remove("ps-drag-over"));
        row.addEventListener("drop", (e) => this._handleDrop(e, node.path));

        // Drag — folder as source
        row.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("application/ps-path", node.path);
          e.dataTransfer.setData("application/ps-type", "folder");
          e.dataTransfer.effectAllowed = "move";
          row.classList.add("ps-dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("ps-dragging"));

        parent.appendChild(row);

        if (expanded && node.children) {
          this._renderNodes(parent, node.children, depth + 1);
        }
      } else {
        // Prompt file
        row.innerHTML = `<span class="ps-tree-icon">📝</span><span class="ps-tree-label">${node.name}</span>`;

        row.addEventListener("click", () => {
          this.selectedPath = node.path;
          this.render();
          this.onSelect(node.path);
        });

        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this._showPromptMenu(e, node);
        });

        // Drag — prompt as source
        row.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("application/ps-path", node.path);
          e.dataTransfer.setData("application/ps-type", "prompt");
          e.dataTransfer.effectAllowed = "move";
          row.classList.add("ps-dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("ps-dragging"));

        parent.appendChild(row);
      }
    }
  }

  // ── Drag & drop ──────────────────────────────────────────────────

  async _handleDrop(e, destFolder) {
    e.preventDefault();
    const target = e.currentTarget;
    target.classList.remove("ps-drag-over");

    const srcPath = e.dataTransfer.getData("application/ps-path");
    const srcType = e.dataTransfer.getData("application/ps-type");
    if (!srcPath || srcPath === destFolder) return;

    if (srcType === "prompt") {
      await api.movePrompt(srcPath, destFolder);
    } else if (srcType === "folder") {
      await api.moveCategory(srcPath, destFolder);
    }
    await this.refresh();
  }

  // ── Context menus ────────────────────────────────────────────────

  _showFolderMenu(e, node) {
    this.ctx.show(e, [
      { label: "New Prompt", action: () => this._newPrompt(node.path) },
      { label: "New Subfolder", action: () => this._newFolder(node.path) },
      { separator: true },
      { label: "Rename", action: () => this._renameCategory(node) },
      { label: "Move to...", action: () => this._moveCategoryTo(node) },
      { separator: true },
      { label: "Delete", danger: true, action: () => this._deleteCategory(node) },
    ]);
  }

  _showPromptMenu(e, node) {
    this.ctx.show(e, [
      { label: "Rename", action: () => this._renamePrompt(node) },
      { label: "Move to...", action: () => this._movePromptTo(node) },
      { separator: true },
      { label: "Delete", danger: true, action: () => this._deletePrompt(node) },
    ]);
  }

  // ── Actions ──────────────────────────────────────────────────────

  async _newPrompt(category) {
    const name = await this.modal.prompt("New Prompt", "", "Prompt name...");
    if (!name) return;
    await api.savePrompt(name, category, "", "");
    this.expandedCats.add(category);
    await this.refresh();
    // Select the new prompt
    this.selectedPath = category ? `${category}\\${name}` : name;
    this.render();
    this.onSelect(this.selectedPath);
  }

  async _newFolder(parent) {
    const name = await this.modal.prompt("New Folder", "", "Folder name...");
    if (!name) return;
    const path = parent ? `${parent}\\${name}` : name;
    await api.addCategory(path);
    this.expandedCats.add(parent);
    this.expandedCats.add(path);
    await this.refresh();
  }

  async _renamePrompt(node) {
    const newName = await this.modal.prompt("Rename Prompt", node.name);
    if (!newName || newName === node.name) return;
    await api.renamePrompt(node.path, newName);
    await this.refresh();
  }

  async _renameCategory(node) {
    const newName = await this.modal.prompt("Rename Folder", node.name);
    if (!newName || newName === node.name) return;
    await api.renameCategory(node.path, newName);
    await this.refresh();
  }

  async _deletePrompt(node) {
    const ok = await this.modal.confirm(`Delete prompt "${node.name}"? This cannot be undone.`);
    if (!ok) return;
    await api.deletePrompt(node.path);
    if (this.selectedPath === node.path) { this.selectedPath = null; this.onSelect(null); }
    await this.refresh();
  }

  async _deleteCategory(node) {
    const ok = await this.modal.confirm(`Delete folder "${node.name}" and all its contents? This cannot be undone.`);
    if (!ok) return;
    await api.deleteCategory(node.path);
    await this.refresh();
  }

  async _movePromptTo(node) {
    const cats = await api.listCategories();
    const dest = await this.modal.selectFolder("Move prompt to...", cats);
    if (dest === null) return;
    await api.movePrompt(node.path, dest);
    await this.refresh();
  }

  async _moveCategoryTo(node) {
    const cats = await api.listCategories();
    const dest = await this.modal.selectFolder("Move folder to...", cats, node.path);
    if (dest === null) return;
    await api.moveCategory(node.path, dest);
    await this.refresh();
  }
}
