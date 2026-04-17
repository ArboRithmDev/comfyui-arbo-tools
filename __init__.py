"""Arbo Tools — Custom utility nodes for ComfyUI."""

import sys

from .nodes.optional_load_image import OptionalLoadImage
from .nodes.optional_merge_images import OptionalMergeImages
from .nodes.join_text_list import JoinTextList
from .nodes.prompt_manager import PromptPair
from .nodes.quality_switch import QualitySwitch
from .nodes.negative_presets import NegativePresets
from .nodes.pose_body_masks import PoseBodyMasks
from .nodes.pose_fit_canvas import PoseFitCanvas
from .nodes.pose_preset import PosePreset

# Register server routes (spellcheck endpoint) when running inside ComfyUI
try:
    from .arbo_server import spellcheck  # noqa: F401 — registers routes on import
    from .arbo_server import prompt_storage  # noqa: F401 — registers prompt API routes
    from .arbo_server import prompt_enhance  # noqa: F401 — registers studio/enhance routes
    from .arbo_server import snippets  # noqa: F401 — registers snippet routes
except Exception:
    pass

NODE_CLASS_MAPPINGS = {
    "ArboTools_OptionalLoadImage": OptionalLoadImage,
    "ArboTools_OptionalMergeImages": OptionalMergeImages,
    "ArboTools_JoinTextList": JoinTextList,
    "ArboTools_PromptPair": PromptPair,
    "ArboTools_QualitySwitch": QualitySwitch,
    "ArboTools_NegativePresets": NegativePresets,
    "ArboTools_PoseBodyMasks": PoseBodyMasks,
    "ArboTools_PoseFitCanvas": PoseFitCanvas,
    "ArboTools_PosePreset": PosePreset,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ArboTools_OptionalLoadImage": "Load Image (Optional)",
    "ArboTools_OptionalMergeImages": "Merge Images (Optional)",
    "ArboTools_JoinTextList": "Join Text List",
    "ArboTools_PromptPair": "Prompt Pair",
    "ArboTools_QualitySwitch": "Quality Switch",
    "ArboTools_NegativePresets": "Negative Presets",
    "ArboTools_PoseBodyMasks": "Pose Body Masks",
    "ArboTools_PoseFitCanvas": "Pose Fit Canvas",
    "ArboTools_PosePreset": "Pose Preset",
}
WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
