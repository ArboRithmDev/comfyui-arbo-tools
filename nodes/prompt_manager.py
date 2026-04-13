"""Prompt Manager — Save, load, and organize prompt pairs with categories."""

from __future__ import annotations

import sys
from pathlib import Path

_root = Path(__file__).parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from arbo_server.prompt_storage import (
    list_prompt_names,
    get_prompt_by_path,
    list_neglib_names,
    get_neglib_text,
    save_prompt,
    list_categories,
    save_neglib_entry,
)


class PromptPair:
    """Prompt manager with category organization and negative library.

    - Load: select a saved prompt from the dropdown → fields auto-populate
    - Edit: modify positive/negative text
    - Save: type a name + category, toggle save
    - Negative library: stack up to 3 presets onto your specific negative
    """

    @classmethod
    def INPUT_TYPES(s):
        prompts = ["(none)"] + list_prompt_names()
        neglib = ["none"] + list_neglib_names()

        return {
            "required": {
                # ── Load ──
                "load_preset": (prompts,),
                # ── Edit ──
                "positive": ("STRING", {"default": "", "multiline": True}),
                "negative": ("STRING", {"default": "", "multiline": True}),
                # ── Negative library ──
                "neg_preset_1": (neglib, {"default": "none"}),
                "neg_preset_2": (neglib, {"default": "none"}),
                "neg_preset_3": (neglib, {"default": "none"}),
                # ── Save ──
                "save_category": ("STRING", {"default": "", "placeholder": "Category (e.g. Personnages\\Fantasy)"}),
                "save_name": ("STRING", {"default": "", "placeholder": "Prompt name"}),
                "auto_save": ("BOOLEAN", {"default": False}),
                "auto_replace": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("POSITIVE", "NEGATIVE")
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Prompt"

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")

    def execute(self, load_preset, positive, negative,
                neg_preset_1, neg_preset_2, neg_preset_3,
                save_category, save_name, auto_save, auto_replace):

        # Build combined negative: specific + library presets
        neg_parts = [negative] if negative else []
        for preset in (neg_preset_1, neg_preset_2, neg_preset_3):
            if preset and preset != "none":
                text = get_neglib_text(preset)
                if text:
                    neg_parts.append(text)
        final_negative = ", ".join(neg_parts)

        # Auto-save if enabled and a name is provided
        if auto_save and save_name:
            save_prompt(
                name=save_name,
                category=save_category,
                positive=positive,
                negative=negative,
                auto_replace=auto_replace,
            )

        return (positive, final_negative)


class NegativeLibrary:
    """Create and manage reusable negative prompt presets.

    - Load: select a preset from the dropdown → fields auto-populate
    - Edit: modify title and content
    - Save: toggle save to persist changes
    """

    @classmethod
    def INPUT_TYPES(s):
        presets = ["(new)"] + list_neglib_names()
        return {
            "required": {
                "load_preset": (presets,),
                "title": ("STRING", {"default": "", "placeholder": "Preset name (e.g. Low quality)"}),
                "content": ("STRING", {"default": "", "multiline": True, "placeholder": "Negative prompt content..."}),
                "save": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "append_to": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("NEGATIVE",)
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Prompt"

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")

    def execute(self, load_preset, title, content, save, append_to=""):
        # Save if requested
        if save and title:
            save_neglib_entry(name=title, text=content)

        # Output
        if append_to:
            return (f"{append_to}, {content}" if content else append_to,)
        return (content,)
