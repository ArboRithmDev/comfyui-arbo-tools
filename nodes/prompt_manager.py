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
)


class PromptPair:
    """Prompt manager with category organization.

    Select a category and prompt from dropdowns, edit positive/negative text.
    Use the + and New buttons (added by JS) to create new entries.
    """

    @classmethod
    def INPUT_TYPES(s):
        categories = ["(all)"] + list_categories()
        prompts = ["(none)"] + list_prompt_names()

        return {
            "required": {
                "category": (categories,),
                "prompt": (prompts,),
                "auto_save": ("BOOLEAN", {"default": False}),
                "auto_replace": ("BOOLEAN", {"default": True}),
                "positive": ("STRING", {"default": "", "multiline": True}),
                "negative": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "neg_general": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("POSITIVE", "NEGATIVE")
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Prompt"

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")

    def execute(self, category, prompt, auto_save, auto_replace,
                positive, negative, neg_general=""):

        # Build final negative: specific + optional general
        if neg_general:
            final_negative = f"{negative}, {neg_general}" if negative else neg_general
        else:
            final_negative = negative

        # Auto-save if enabled
        if auto_save and prompt and prompt != "(none)":
            # Extract name from path
            parts = prompt.replace("/", "\\").split("\\")
            name = parts[-1]
            cat = "\\".join(parts[:-1]) if len(parts) > 1 else ""
            save_prompt(
                name=name,
                category=cat,
                positive=positive,
                negative=negative,
                auto_replace=auto_replace,
            )

        return (positive, final_negative)
