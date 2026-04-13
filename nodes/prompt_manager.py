"""PromptPair — Load, edit, and save positive/negative prompt pairs with categories."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Ensure server module is importable
_root = Path(__file__).parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from server.prompt_storage import (
    list_prompt_names,
    get_prompt_by_path,
    list_neglib_names,
    get_neglib_text,
    _load_prompts,
    _save_prompts,
)

import time
import uuid


class PromptPair:
    """Load or create a prompt pair (positive + negative) with category organization.

    Select a saved prompt to load it, or type new text and toggle Save to persist.
    The negative library appends general negative terms to your specific negative prompt.
    """

    @classmethod
    def INPUT_TYPES(s):
        saved = ["— new —"] + list_prompt_names()
        neglib = ["none"] + list_neglib_names()

        return {
            "required": {
                "preset": (saved, {"default": "— new —"}),
                "positive": ("STRING", {"default": "", "multiline": True, "placeholder": "Positive prompt..."}),
                "negative": ("STRING", {"default": "", "multiline": True, "placeholder": "Negative prompt..."}),
                "neg_library": (neglib, {"default": "none"}),
                "save_as": ("STRING", {"default": "", "placeholder": "Name to save (e.g. Chamane v1)"}),
                "category": ("STRING", {"default": "", "placeholder": "Category path (e.g. Personnages/Fantasy)"}),
                "save": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("POSITIVE", "NEGATIVE")
    OUTPUT_TOOLTIPS = ("The positive prompt text", "The negative prompt (specific + library)")
    FUNCTION = "execute"
    CATEGORY = "text"

    @classmethod
    def IS_CHANGED(s, preset, positive, negative, neg_library, save_as, category, save):
        # Always re-execute when save is toggled or preset changes
        return f"{preset}_{save}_{neg_library}_{positive[:20]}_{negative[:20]}"

    def execute(self, preset, positive, negative, neg_library, save_as, category, save):
        # Load from preset if selected (and user hasn't typed custom text)
        if preset != "— new —" and not positive and not negative:
            prompt = get_prompt_by_path(preset)
            if prompt:
                positive = prompt.get("positive", "")
                negative = prompt.get("negative", "")

        # Append negative library
        final_negative = negative
        if neg_library and neg_library != "none":
            lib_text = get_neglib_text(neg_library)
            if lib_text:
                if final_negative:
                    final_negative = f"{final_negative}, {lib_text}"
                else:
                    final_negative = lib_text

        # Save if requested
        if save and save_as:
            data = _load_prompts()
            prompt_entry = {
                "id": str(uuid.uuid4())[:8],
                "name": save_as.strip(),
                "category": category.strip(),
                "positive": positive,
                "negative": negative,  # Save the specific negative, not the combined
                "tags": [],
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }

            # Check if a prompt with same name+category exists → update
            existing_idx = None
            for i, p in enumerate(data["prompts"]):
                if p.get("name") == save_as.strip() and p.get("category") == category.strip():
                    existing_idx = i
                    break

            if existing_idx is not None:
                prompt_entry["id"] = data["prompts"][existing_idx]["id"]
                prompt_entry["created_at"] = data["prompts"][existing_idx].get("created_at", prompt_entry["created_at"])
                data["prompts"][existing_idx] = prompt_entry
            else:
                data["prompts"].append(prompt_entry)

            _save_prompts(data)

        return (positive, final_negative)


class NegativeLibrary:
    """Load a negative prompt preset from the shared library.

    Connect the output to the negative input of a prompt node,
    or combine multiple presets.
    """

    @classmethod
    def INPUT_TYPES(s):
        presets = list_neglib_names()
        return {
            "required": {
                "preset": (presets if presets else ["(empty)"],),
            },
            "optional": {
                "append_to": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("NEGATIVE",)
    FUNCTION = "execute"
    CATEGORY = "text"

    def execute(self, preset, append_to=""):
        text = get_neglib_text(preset)
        if append_to:
            return (f"{append_to}, {text}" if text else append_to,)
        return (text,)
