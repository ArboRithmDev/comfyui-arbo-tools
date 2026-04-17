"""NegativePresets — Compose a negative prompt from toggleable presets."""

from __future__ import annotations

import sys
import json
from pathlib import Path

_root = Path(__file__).parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from arbo_server.prompt_storage import _load_neglib, list_neglib_names, get_neglib_text


class NegativePresets:
    """Combine negative prompt presets with toggles.

    Each preset from the negative library gets an ON/OFF toggle.
    All active presets are combined into a single negative string.
    Connect the output to PromptPair.neg_general.
    """

    @classmethod
    def INPUT_TYPES(s):
        names = list_neglib_names()
        inputs = {"required": {}}

        # Create a toggle for each preset
        for name in names:
            safe_key = name.replace(" ", "_").replace("-", "_").lower()
            inputs["required"][safe_key] = ("BOOLEAN", {
                "default": name in ("Low quality", "Bad anatomy"),
                "label_on": name,
                "label_off": name,
            })

        # Custom addition field
        inputs["required"]["custom"] = ("STRING", {
            "default": "",
            "multiline": True,
            "placeholder": "Additional negative terms...",
        })

        inputs["optional"] = {
            "append_to": ("STRING", {"forceInput": True}),
        }

        return inputs

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("NEGATIVE",)
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Prompt"

    @classmethod
    def VALIDATE_INPUTS(s, **kwargs):
        return True

    def execute(self, custom="", append_to="", **toggles):
        names = list_neglib_names()
        parts = []

        # Collect active presets
        for name in names:
            safe_key = name.replace(" ", "_").replace("-", "_").lower()
            if toggles.get(safe_key, False):
                text = get_neglib_text(name)
                if text:
                    parts.append(text)

        # Add custom text
        if custom.strip():
            parts.append(custom.strip())

        result = ", ".join(parts)

        # Prepend append_to if provided
        if append_to:
            result = f"{append_to}, {result}" if result else append_to

        return (result,)
