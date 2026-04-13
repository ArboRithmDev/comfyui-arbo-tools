/**
 * Prompt Studio — Right-click context menu.
 */

export class ContextMenu {
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "ps-context-menu";
    this.overlay = document.createElement("div");
    this.overlay.className = "ps-context-overlay";
    this.overlay.onclick = () => this.hide();
  }

  show(e, items) {
    this.el.innerHTML = "";
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "ps-ctx-separator";
        this.el.appendChild(sep);
        continue;
      }
      const div = document.createElement("div");
      div.className = `ps-ctx-item${item.danger ? " danger" : ""}`;
      div.textContent = item.label;
      div.onclick = () => { this.hide(); item.action(); };
      this.el.appendChild(div);
    }

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.el);

    // Position
    this.el.style.left = Math.min(e.pageX, window.innerWidth - 180) + "px";
    this.el.style.top = Math.min(e.pageY, window.innerHeight - (items.length * 32 + 10)) + "px";
  }

  hide() {
    this.el.remove();
    this.overlay.remove();
  }
}
