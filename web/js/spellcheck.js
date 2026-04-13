/**
 * Arbo Tools — Spellcheck with hover suggestions for ComfyUI.
 *
 * Checks spelling via the Python backend and shows a floating panel
 * with all corrections when hovering over a text widget.
 */

const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

const CHECK_DELAY = 800;
const HOVER_DELAY = 400;
const API_URL = "/arbo-tools/spellcheck";

const LOCALE_MAP = {
  "en": "en", "en-US": "en", "en-GB": "en",
  "fr": "fr", "fr-FR": "fr",
  "de": "de", "de-DE": "de",
  "es": "es", "es-ES": "es",
  "pt": "pt", "pt-BR": "pt",
  "it": "it", "ru": "ru",
};

async function getSpellLang() {
  try {
    const resp = await fetch("/settings");
    const settings = await resp.json();
    const locale = settings["Comfy.Locale"] || "en";
    return LOCALE_MAP[locale] || locale.split("-")[0] || "en";
  } catch { return "en"; }
}

let _spellLang = null;

// ── Styles ──────────────────────────────────────────────────────────

const STYLE = document.createElement("style");
STYLE.textContent = `
  .arbo-spell-panel {
    position: fixed;
    z-index: 100000;
    background: #1e1e2e;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 6px 0;
    font-family: -apple-system, sans-serif;
    font-size: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    max-width: 280px;
    max-height: 200px;
    overflow-y: auto;
    pointer-events: auto;
  }
  .arbo-spell-panel .spell-title {
    padding: 4px 10px 6px;
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .arbo-spell-panel .spell-error {
    padding: 3px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid #2a2a3a;
  }
  .arbo-spell-panel .spell-error:last-child { border-bottom: none; }
  .arbo-spell-panel .spell-word {
    color: #f87171;
    text-decoration: line-through;
    flex-shrink: 0;
    font-weight: 500;
  }
  .arbo-spell-panel .spell-arrow { color: #555; flex-shrink: 0; }
  .arbo-spell-panel .spell-fixes {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .arbo-spell-panel .spell-fix {
    color: #4ecdc4;
    cursor: pointer;
    padding: 1px 5px;
    border-radius: 3px;
    transition: background 0.1s;
  }
  .arbo-spell-panel .spell-fix:hover {
    background: #333;
  }
  .arbo-spell-panel .spell-ok {
    padding: 8px 10px;
    color: #4ecdc4;
    text-align: center;
    font-size: 11px;
  }
`;

// ── State ───────────────────────────────────────────────────────────

let panel = null;
let hoverTimer = null;
let checkTimer = null;
let activeTextarea = null;
const fieldErrors = new WeakMap();

// ── Panel ───────────────────────────────────────────────────────────

function createPanel() {
  if (panel) return panel;
  panel = document.createElement("div");
  panel.className = "arbo-spell-panel";
  panel.style.display = "none";
  document.body.appendChild(panel);
  panel.addEventListener("mouseleave", () => {
    setTimeout(() => {
      if (panel && !panel.matches(":hover")) hidePanel();
    }, 300);
  });
  return panel;
}

function showPanel(textarea) {
  const errors = fieldErrors.get(textarea) || [];
  const p = createPanel();

  if (errors.length === 0) {
    p.innerHTML = `<div class="spell-ok">No spelling errors</div>`;
  } else {
    let html = `<div class="spell-title">${errors.length} correction${errors.length > 1 ? "s" : ""}</div>`;
    for (const err of errors) {
      html += `<div class="spell-error">`;
      html += `<span class="spell-word">${err.word}</span>`;
      html += `<span class="spell-arrow">→</span>`;
      html += `<span class="spell-fixes">`;
      if (err.suggestions.length === 0) {
        html += `<span style="color:#666;">?</span>`;
      } else {
        for (const s of err.suggestions.slice(0, 3)) {
          html += `<span class="spell-fix" data-old="${err.word}" data-new="${s}">${s}</span>`;
        }
      }
      html += `</span></div>`;
    }
    p.innerHTML = html;
  }

  // Position near the textarea
  const rect = textarea.getBoundingClientRect();
  p.style.left = Math.min(rect.left, window.innerWidth - 290) + "px";
  p.style.top = Math.min(rect.bottom + 4, window.innerHeight - 210) + "px";
  p.style.display = "block";
  activeTextarea = textarea;

  // Bind fix clicks
  p.querySelectorAll(".spell-fix").forEach(el => {
    el.onclick = () => {
      replaceWord(textarea, el.dataset.old, el.dataset.new);
      // Refresh panel after fix
      setTimeout(() => showPanel(textarea), 100);
    };
  });
}

function hidePanel() {
  if (panel) panel.style.display = "none";
  activeTextarea = null;
}

// ── Word replacement ────────────────────────────────────────────────

function replaceWord(textarea, oldWord, newWord) {
  const text = textarea.value;
  const regex = new RegExp(`\\b${escapeRegex(oldWord)}\\b`, "gi");
  const match = regex.exec(text);
  if (match) {
    const replacement = matchCase(match[0], newWord);
    textarea.value = text.slice(0, match.index) + replacement + text.slice(match.index + match[0].length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
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

  if (!_spellLang) _spellLang = await getSpellLang();

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: _spellLang }),
    });
    const data = await resp.json();
    fieldErrors.set(textarea, data.errors || []);

    // If panel is open for this textarea, refresh it
    if (activeTextarea === textarea && panel?.style.display === "block") {
      showPanel(textarea);
    }
  } catch (e) {
    // Silently fail
  }
}

function scheduleCheck(textarea) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => checkSpelling(textarea), CHECK_DELAY);
}

// ── Event binding ───────────────────────────────────────────────────

function bindTextarea(textarea) {
  if (textarea.dataset.arboSpellBound) return;
  textarea.dataset.arboSpellBound = "1";

  textarea.addEventListener("input", () => scheduleCheck(textarea));
  textarea.addEventListener("focus", () => scheduleCheck(textarea));

  textarea.addEventListener("mouseenter", () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const errors = fieldErrors.get(textarea) || [];
      if (errors.length > 0) showPanel(textarea);
    }, HOVER_DELAY);
  });

  textarea.addEventListener("mouseleave", () => {
    clearTimeout(hoverTimer);
    setTimeout(() => {
      if (panel && !panel.matches(":hover")) hidePanel();
    }, 300);
  });

  if (textarea.value) scheduleCheck(textarea);
}

// ── Extension ───────────────────────────────────────────────────────

app.registerExtension({
  name: "ArboTools.Spellcheck",
  setup() {
    document.head.appendChild(STYLE);
    document.querySelectorAll("textarea").forEach(bindTextarea);

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
