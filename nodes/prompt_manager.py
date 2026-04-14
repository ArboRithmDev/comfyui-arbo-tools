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
                "concatenate": ("BOOLEAN", {"default": False, "label_on": "Chain ON", "label_off": "Chain OFF"}),
                "separator": ("STRING", {"default": "\n", "multiline": False, "placeholder": "Separator (default: newline)"}),
                "positive": ("STRING", {"default": "", "multiline": True}),
                "negative": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "prev_positive": ("STRING", {"forceInput": True}),
                "prev_negative": ("STRING", {"forceInput": True}),
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

    def execute(self, category, prompt, auto_save, concatenate, separator,
                positive, negative,
                prev_positive="", prev_negative="", neg_general="",
                selected_prompt=""):

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

        # Concatenate with previous widget if chaining is enabled
        sep = separator if separator else "\n"
        if concatenate and prev_positive:
            positive = f"{prev_positive}{sep}{positive}" if positive else prev_positive
        if concatenate and prev_negative:
            negative = f"{prev_negative}{sep}{negative}" if negative else prev_negative

        # Append general negative
        if neg_general:
            negative = f"{negative}, {neg_general}" if negative else neg_general

        return (positive, negative)
