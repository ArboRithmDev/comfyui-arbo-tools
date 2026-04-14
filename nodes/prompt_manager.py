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
    list_prompts_in_category,
)


class PromptPair:
    """Prompt manager with category organization.

    Select a category and prompt from dropdowns, edit positive/negative text.
    Use the + and New buttons (added by JS) to create new entries.
    """

    @classmethod
    def INPUT_TYPES(s):
        categories = ["(all)"] + list_categories()

        return {
            "required": {
                "category": (categories,),
                "prompt": ("STRING", {"default": "(none)", "multiline": False}),
                "auto_save": ("BOOLEAN", {"default": False}),
                "positive": ("STRING", {"default": "", "multiline": True}),
                "negative": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "neg_general": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "selected_prompt": "STRING",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("POSITIVE", "NEGATIVE")
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Prompt"

    @classmethod
    def VALIDATE_INPUTS(s, **kwargs):
        # Accept any value — the JS frontend dynamically filters the combo
        return True

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")

    def execute(self, category, prompt, auto_save,
                positive, negative, neg_general="", selected_prompt=""):

        # Use selected_prompt from hidden if available, else widget value
        prompt = selected_prompt or prompt
        if prompt and prompt != "(none)":
            saved = get_prompt_by_path(prompt)
            if not saved:
                cat_filter = category if category != "(all)" else ""
                for c in list_prompts_in_category(cat_filter):
                    if c["name"] == prompt:
                        saved = get_prompt_by_path(c["path"])
                        break
            if saved:
                positive = saved.get("positive", "")
                negative = saved.get("negative", "")

        # Build final negative: specific + optional general
        if neg_general:
            final_negative = f"{negative}, {neg_general}" if negative else neg_general
        else:
            final_negative = negative

        return (positive, final_negative)
