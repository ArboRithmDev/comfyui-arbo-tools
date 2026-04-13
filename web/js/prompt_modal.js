/**
 * Prompt Studio — Modal dialogs (prompt, confirm, folder picker).
 * Inspired by comfyui-workflow-folders/ui-modal.js
 */

export class Modal {
  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.className = "ps-modal-overlay";
    this.box = document.createElement("div");
    this.box.className = "ps-modal";
    this.overlay.appendChild(this.box);
  }

  _show() {
    document.body.appendChild(this.overlay);
    const input = this.box.querySelector("input");
    if (input) setTimeout(() => input.focus(), 50);
  }

  _hide() {
    this.overlay.remove();
  }

  prompt(title, defaultValue = "", placeholder = "") {
    return new Promise((resolve) => {
      this.box.innerHTML = `
        <h3>${title}</h3>
        <input type="text" class="ps-input" value="${defaultValue}" placeholder="${placeholder}">
        <div class="ps-modal-buttons">
          <button class="ps-btn ps-btn-cancel">Cancel</button>
          <button class="ps-btn ps-btn-ok">OK</button>
        </div>
      `;
      this._show();

      const input = this.box.querySelector("input");
      const ok = () => { const v = input.value.trim(); this._hide(); resolve(v || null); };
      const cancel = () => { this._hide(); resolve(null); };

      this.box.querySelector(".ps-btn-ok").onclick = ok;
      this.box.querySelector(".ps-btn-cancel").onclick = cancel;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") ok();
        if (e.key === "Escape") cancel();
      });
      this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) cancel(); });
    });
  }

  confirm(message) {
    return new Promise((resolve) => {
      this.box.innerHTML = `
        <h3>Confirm</h3>
        <p style="color:#ccc;font-size:13px;margin:10px 0;">${message}</p>
        <div class="ps-modal-buttons">
          <button class="ps-btn ps-btn-cancel">Cancel</button>
          <button class="ps-btn ps-btn-danger">Delete</button>
        </div>
      `;
      this._show();

      this.box.querySelector(".ps-btn-danger").onclick = () => { this._hide(); resolve(true); };
      this.box.querySelector(".ps-btn-cancel").onclick = () => { this._hide(); resolve(false); };
      this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) { this._hide(); resolve(false); } });
    });
  }

  selectFolder(title, folders, excludePath = "") {
    return new Promise((resolve) => {
      const buildTree = (items, depth = 0) => {
        let html = "";
        for (const f of items) {
          if (f === excludePath || f.startsWith(excludePath + "\\")) continue;
          const indent = depth * 20;
          const label = f.split("\\").pop();
          html += `<div class="ps-folder-item" data-path="${f}" style="padding-left:${indent + 10}px;">📁 ${label}</div>`;
        }
        return html;
      };

      // Build flat list with indentation based on depth
      const sorted = [...folders].sort();
      const withDepth = sorted.map(f => ({ path: f, depth: f.split("\\").length - 1 }));

      let itemsHtml = `<div class="ps-folder-item" data-path="" style="font-weight:600;">📁 (root)</div>`;
      for (const f of withDepth) {
        if (f.path === excludePath || f.path.startsWith(excludePath + "\\")) continue;
        const indent = f.depth * 20;
        const label = f.path.split("\\").pop();
        itemsHtml += `<div class="ps-folder-item" data-path="${f.path}" style="padding-left:${indent + 10}px;">📁 ${label}</div>`;
      }

      this.box.innerHTML = `
        <h3>${title}</h3>
        <div class="ps-folder-list">${itemsHtml}</div>
        <div class="ps-modal-buttons">
          <button class="ps-btn ps-btn-cancel">Cancel</button>
          <button class="ps-btn ps-btn-ok" disabled>Move</button>
        </div>
      `;
      this._show();

      let selected = null;
      this.box.querySelectorAll(".ps-folder-item").forEach(item => {
        item.onclick = () => {
          this.box.querySelectorAll(".ps-folder-item").forEach(i => i.classList.remove("selected"));
          item.classList.add("selected");
          selected = item.dataset.path;
          this.box.querySelector(".ps-btn-ok").disabled = false;
        };
      });

      this.box.querySelector(".ps-btn-ok").onclick = () => { this._hide(); resolve(selected); };
      this.box.querySelector(".ps-btn-cancel").onclick = () => { this._hide(); resolve(null); };
      this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) { this._hide(); resolve(null); } });
    });
  }
}
