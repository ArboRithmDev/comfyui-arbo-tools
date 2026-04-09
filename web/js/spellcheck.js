/**
 * Arbo Tools — Spellcheck enabler for ComfyUI text widgets.
 *
 * Enables the native browser/Electron spell checker on all text inputs
 * and textareas in ComfyUI. This gives red underlines on misspelled words
 * and right-click suggestions for corrections.
 *
 * Works with:
 * - Node text widgets (prompts, strings, etc.)
 * - Combo text inputs
 * - Any dynamically created text fields
 */

import { app } from "../../scripts/app.js";

const LANG = "fr";

function enableSpellcheck(el) {
  if (el.dataset.arboSpellcheck) return;
  el.setAttribute("spellcheck", "true");
  el.setAttribute("lang", LANG);
  el.dataset.arboSpellcheck = "1";
}

function scanAndEnable(root) {
  const targets = root.querySelectorAll
    ? root.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')
    : [];
  targets.forEach(enableSpellcheck);
}

app.registerExtension({
  name: "ArboTools.Spellcheck",

  setup() {
    // Enable on all existing fields
    scanAndEnable(document.body);

    // Watch for dynamically created fields (node widgets are created on demand)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Check the node itself
          if (node.matches?.('textarea, input[type="text"], [contenteditable="true"]')) {
            enableSpellcheck(node);
          }
          // Check children
          scanAndEnable(node);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },
});
