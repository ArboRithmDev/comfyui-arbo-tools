/**
 * Arbo Tools — Spellcheck with hover suggestions for ComfyUI.
 *
 * Checks spelling via the Python backend and shows correction suggestions
 * in a floating tooltip when hovering over misspelled words.
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const CHECK_DELAY = 800;   // ms after typing to trigger check
const HOVER_DELAY = 400;   // ms hover before showing tooltip
const API_URL = "/arbo-tools/spellcheck";

// Map ComfyUI locale codes to spellchecker language codes
const LOCALE_MAP = {
  "en": "en", "en-US": "en", "en-GB": "en",
  "fr": "fr", "fr-FR": "fr",
  "de": "de", "de-DE": "de",
  "es": "es", "es-ES": "es",
  "pt": "pt", "pt-BR": "pt",
  "it": "it",
  "ru": "ru",
};

async function getSpellLang() {
  try {
    const resp = await fetch("/settings");
    const settings = await resp.json();
    const locale = settings["Comfy.Locale"] || "en";
    return LOCALE_MAP[locale] || locale.split("-")[0] || "en";
  } catch {
    return "en";
  }
}

let _spellLang = null;

// ── Styles ──────────────────────────────────────────────────────────

const STYLE = document.createElement("style");
STYLE.textContent = `
  .arbo-spell-tooltip {
    position: fixed;
    z-index: 100000;
    background: #1e1e2e;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 4px 0;
    font-family: -apple-system, sans-serif;
    font-size: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    max-width: 220px;
    pointer-events: auto;
  }
  .arbo-spell-tooltip .spell-header {
    padding: 4px 10px;
    color: #f87171;
    font-size: 11px;
    border-bottom: 1px solid #333;
    margin-bottom: 2px;
  }
  .arbo-spell-tooltip .spell-suggestion {
    padding: 4px 10px;
    color: #e0e0e0;
    cursor: pointer;
    transition: background 0.1s;
  }
  .arbo-spell-tooltip .spell-suggestion:hover {
    background: #333;
    color: #4ecdc4;
  }
  .arbo-spell-underline {
    text-decoration: wavy underline #f87171;
    text-underline-offset: 3px;
  }
`;

// ── State ───────────────────────────────────────────────────────────

let tooltip = null;
let hoverTimer = null;
let checkTimer = null;
const fieldErrors = new WeakMap(); // textarea → [{word, offset, length, suggestions}]

// ── Tooltip ─────────────────────────────────────────────────────────

function createTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.className = "arbo-spell-tooltip";
  tooltip.style.display = "none";
  document.body.appendChild(tooltip);
  tooltip.addEventListener("mouseleave", hideTooltip);
  return tooltip;
}

function showTooltip(x, y, word, suggestions, textarea) {
  const tt = createTooltip();
  let html = `<div class="spell-header">"${word}" — suggestions</div>`;
  if (suggestions.length === 0) {
    html += `<div class="spell-suggestion" style="color:#666;cursor:default;">Aucune suggestion</div>`;
  } else {
    for (const s of suggestions) {
      html += `<div class="spell-suggestion" data-replacement="${s}">${s}</div>`;
    }
  }
  tt.innerHTML = html;

  // Position near cursor but within viewport
  const rect = document.body.getBoundingClientRect();
  tt.style.left = Math.min(x, window.innerWidth - 240) + "px";
  tt.style.top = Math.min(y + 20, window.innerHeight - 200) + "px";
  tt.style.display = "block";

  // Click handlers for suggestions
  tt.querySelectorAll(".spell-suggestion[data-replacement]").forEach(el => {
    el.onclick = () => {
      replaceWord(textarea, word, el.dataset.replacement);
      hideTooltip();
    };
  });
}

function hideTooltip() {
  if (tooltip) tooltip.style.display = "none";
  clearTimeout(hoverTimer);
}

// ── Word replacement ────────────────────────────────────────────────

function replaceWord(textarea, oldWord, newWord) {
  const text = textarea.value;
  const cursor = textarea.selectionStart;

  // Find the occurrence of the word closest to cursor position
  const regex = new RegExp(`\\b${escapeRegex(oldWord)}\\b`, "gi");
  let match;
  let bestMatch = null;
  let bestDist = Infinity;

  while ((match = regex.exec(text)) !== null) {
    const dist = Math.abs(match.index - cursor);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = match;
    }
  }

  if (bestMatch) {
    // Preserve original case pattern
    const replacement = matchCase(bestMatch[0], newWord);
    textarea.value = text.slice(0, bestMatch.index) + replacement + text.slice(bestMatch.index + bestMatch[0].length);
    // Trigger input event so ComfyUI picks up the change
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    // Re-check after replacement
    scheduleCheck(textarea);
  }
}

function matchCase(original, replacement) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Spell checking ──────────────────────────────────────────────────

async function checkSpelling(textarea) {
  const text = textarea.value;
  if (!text || text.length < 3) {
    fieldErrors.set(textarea, []);
    return;
  }

  // Detect language from ComfyUI settings (cached after first call)
  if (!_spellLang) _spellLang = await getSpellLang();

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: _spellLang }),
    });
    const data = await resp.json();
    fieldErrors.set(textarea, data.errors || []);
  } catch (e) {
    // Silently fail — don't break the UI
  }
}

function scheduleCheck(textarea) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => checkSpelling(textarea), CHECK_DELAY);
}

// ── Hover detection ─────────────────────────────────────────────────

function getWordAtCursor(textarea, clientX, clientY) {
  // Get the character position from mouse coordinates
  // We create a mirror div to measure text positions
  const text = textarea.value;
  const errors = fieldErrors.get(textarea) || [];
  if (errors.length === 0) return null;

  // Use the textarea's selection API to find the cursor position
  // This is a simplified approach: we check which error word the cursor is near
  const caretPos = getCaretPositionFromPoint(textarea, clientX, clientY);
  if (caretPos < 0) return null;

  for (const err of errors) {
    if (caretPos >= err.offset && caretPos <= err.offset + err.length) {
      return err;
    }
  }
  return null;
}

function getCaretPositionFromPoint(textarea, clientX, clientY) {
  // Use document.caretPositionFromPoint or caretRangeFromPoint
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos && pos.offsetNode === textarea || pos?.offsetNode?.parentNode === textarea) {
      return pos.offset;
    }
  }

  // Fallback: estimate position from textarea metrics
  const rect = textarea.getBoundingClientRect();
  const style = getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const charWidth = parseFloat(style.fontSize) * 0.6; // approximate
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;

  const relX = clientX - rect.left - paddingLeft;
  const relY = clientY - rect.top - paddingTop + textarea.scrollTop;

  const row = Math.floor(relY / lineHeight);
  const col = Math.floor(relX / charWidth);

  // Find position in text accounting for line wraps
  const lines = textarea.value.split("\n");
  let pos = 0;
  for (let i = 0; i < Math.min(row, lines.length); i++) {
    pos += lines[i].length + 1;
  }
  pos += Math.max(0, col);

  return Math.min(pos, textarea.value.length);
}

// ── Event binding ───────────────────────────────────────────────────

function bindTextarea(textarea) {
  if (textarea.dataset.arboSpellBound) return;
  textarea.dataset.arboSpellBound = "1";

  // Check on input (debounced)
  textarea.addEventListener("input", () => scheduleCheck(textarea));

  // Check on focus
  textarea.addEventListener("focus", () => scheduleCheck(textarea));

  // Show tooltip on hover
  textarea.addEventListener("mousemove", (e) => {
    clearTimeout(hoverTimer);
    const errors = fieldErrors.get(textarea) || [];
    if (errors.length === 0) return;

    hoverTimer = setTimeout(() => {
      const err = getWordAtCursor(textarea, e.clientX, e.clientY);
      if (err) {
        showTooltip(e.clientX, e.clientY, err.word, err.suggestions, textarea);
      } else {
        hideTooltip();
      }
    }, HOVER_DELAY);
  });

  textarea.addEventListener("mouseleave", () => {
    clearTimeout(hoverTimer);
    // Small delay before hiding to allow moving to tooltip
    setTimeout(() => {
      if (tooltip && !tooltip.matches(":hover")) hideTooltip();
    }, 200);
  });

  // Initial check
  if (textarea.value) scheduleCheck(textarea);
}

// ── Extension registration ──────────────────────────────────────────

app.registerExtension({
  name: "ArboTools.Spellcheck",

  setup() {
    document.head.appendChild(STYLE);

    // Bind existing textareas
    document.querySelectorAll("textarea").forEach(bindTextarea);

    // Watch for new textareas (ComfyUI creates them dynamically for node widgets)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === "TEXTAREA") bindTextarea(node);
          node.querySelectorAll?.("textarea").forEach(bindTextarea);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },
});
