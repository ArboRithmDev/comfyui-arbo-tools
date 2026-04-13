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
    """Prompt manager with category organization and negative library.

    Select or create a category, pick a prompt, edit positive/negative text.
    Negative library presets can be stacked onto the specific negative prompt.
    """

    @classmethod
    def INPUT_TYPES(s):
        categories = ["(new)"] + list_categories()
        prompts = ["(new)"] + list_prompt_names()
        neglib = ["none"] + list_neglib_names()

        return {
            "required": {
                "category": (categories, {"editable": True, "placeholder": "Category (e.g. Personnages\\Fantasy)"}),
                "prompt_name": (prompts, {"editable": True, "placeholder": "Prompt name"}),
                "positive": ("STRING", {"default": "", "multiline": True, "placeholder": "Positive prompt..."}),
                "negative": ("STRING", {"default": "", "multiline": True, "placeholder": "Negative prompt (specific to this prompt)..."}),
                "neg_preset_1": (neglib, {"default": "none"}),
                "neg_preset_2": (neglib, {"default": "none"}),
                "neg_preset_3": (neglib, {"default": "none"}),
                "auto_save": ("BOOLEAN", {"default": False}),
                "auto_replace": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "arbo_prompt_id": "STRING",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("POSITIVE", "NEGATIVE")
    OUTPUT_TOOLTIPS = ("The positive prompt", "Combined negative (specific + library presets)")
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Prompt"

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")  # Always re-check

    def execute(self, category, prompt_name, positive, negative,
                neg_preset_1, neg_preset_2, neg_preset_3,
                auto_save, auto_replace, arbo_prompt_id=""):

        # Load from saved prompt if an existing prompt is selected and fields are empty
        if prompt_name and prompt_name != "(new)" and not positive and not negative:
            saved = get_prompt_by_path(prompt_name)
            if saved:
                positive = saved.get("positive", "")
                negative = saved.get("negative", "")

        # Build combined negative: specific + library presets
        neg_parts = [negative] if negative else []
        for preset in (neg_preset_1, neg_preset_2, neg_preset_3):
            if preset and preset != "none":
                text = get_neglib_text(preset)
                if text:
                    neg_parts.append(text)
        final_negative = ", ".join(neg_parts)

        # Auto-save if enabled
        if auto_save and prompt_name and prompt_name != "(new)":
            # Resolve category
            cat = category if category != "(new)" else ""
            # Clean prompt name (remove category prefix if present)
            name = prompt_name.split("\\")[-1] if "\\" in prompt_name else prompt_name
            save_prompt(
                name=name,
                category=cat,
                positive=positive,
                negative=negative,
                prompt_id=arbo_prompt_id or None,
                auto_replace=auto_replace,
            )

        return (positive, final_negative)


class NegativeLibrary:
    """Create and manage reusable negative prompt presets.

    Edit the title and content of a negative preset.
    Save it to the shared library for use in Prompt Pair nodes.
    Connect the output to any negative prompt input.
    """

    @classmethod
    def INPUT_TYPES(s):
        presets = ["(new)"] + list_neglib_names()
        return {
            "required": {
                "preset": (presets, {"editable": True}),
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

    def execute(self, preset, title, content, save, append_to=""):
        # Load preset if selected and fields are empty
        if preset and preset != "(new)" and not content:
            content = get_neglib_text(preset)
            if not title:
                title = preset

        # Save if requested
        if save and title:
            from arbo_server.prompt_storage import save_neglib_entry
            save_neglib_entry(name=title, text=content)

        # Output
        if append_to:
            return (f"{append_to}, {content}" if content else append_to,)
        return (content,)
