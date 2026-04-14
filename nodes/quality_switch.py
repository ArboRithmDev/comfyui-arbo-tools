"""QualitySwitch — Toggle between Draft and HQ render settings."""

import random


class QualitySwitch:
    """Switch between Draft (fast preview) and HQ (final render) settings.

    In Draft mode, seed is randomized on each run.
    In HQ mode, seed is locked to the last Draft value for reproducibility.

    Optional text input is combined with mode for filename tagging.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mode": (["Draft", "HQ"],),
                "draft_steps": ("INT", {"default": 8, "min": 1, "max": 100}),
                "hq_steps": ("INT", {"default": 30, "min": 1, "max": 200}),
                "draft_upscale_steps": ("INT", {"default": 5, "min": 1, "max": 100}),
                "hq_upscale_steps": ("INT", {"default": 15, "min": 1, "max": 200}),
                "draft_width": ("INT", {"default": 512, "min": 64, "max": 8192, "step": 64}),
                "hq_width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 64}),
                "draft_height": ("INT", {"default": 512, "min": 64, "max": 8192, "step": 64}),
                "hq_height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 64}),
                "draft_megapixels": ("FLOAT", {"default": 0.26, "min": 0.1, "max": 16.0, "step": 0.01}),
                "hq_megapixels": ("FLOAT", {"default": 1.05, "min": 0.1, "max": 16.0, "step": 0.01}),
            },
            "optional": {
                "label": ("STRING", {"default": "", "multiline": False, "placeholder": "Tag for filename (e.g. scene_01)"}),
            },
        }

    RETURN_TYPES = ("INT", "INT", "INT", "INT", "FLOAT", "INT", "STRING", "STRING")
    RETURN_NAMES = ("steps", "upscale_steps", "width", "height", "megapixels", "seed", "filename_tag", "mode")
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Utils"

    # Class-level storage for the last draft seed
    _last_draft_seed = None

    @classmethod
    def IS_CHANGED(s, mode, **kwargs):
        # In Draft mode, always re-execute to get a new seed
        if mode == "Draft":
            return float("nan")
        return mode

    def execute(self, mode,
                draft_steps, hq_steps,
                draft_upscale_steps, hq_upscale_steps,
                draft_width, hq_width,
                draft_height, hq_height,
                draft_megapixels, hq_megapixels,
                label=""):

        if mode == "Draft":
            seed = random.randint(0, 2**63 - 1)
            QualitySwitch._last_draft_seed = seed
            steps = draft_steps
            upscale_steps = draft_upscale_steps
            width = draft_width
            height = draft_height
            megapixels = draft_megapixels
        else:
            seed = QualitySwitch._last_draft_seed if QualitySwitch._last_draft_seed is not None else random.randint(0, 2**63 - 1)
            steps = hq_steps
            upscale_steps = hq_upscale_steps
            width = hq_width
            height = hq_height
            megapixels = hq_megapixels

        # Build filename tag: mode_{label_} or just mode_
        tag = f"{mode}_"
        if label:
            tag = f"{mode}_{label}_"

        return (steps, upscale_steps, width, height, megapixels, seed, tag, mode)
