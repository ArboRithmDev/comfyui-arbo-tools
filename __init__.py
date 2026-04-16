"""Arbo Tools — Custom utility nodes for ComfyUI."""

import sys

from .nodes.optional_load_image import OptionalLoadImage
from .nodes.optional_merge_images import OptionalMergeImages
from .nodes.join_text_list import JoinTextList
from .nodes.prompt_manager import PromptPair
from .nodes.quality_switch import QualitySwitch
from .nodes.pose_body_masks import PoseBodyMasks

# Register server routes (spellcheck endpoint) when running inside ComfyUI
try:
    from .arbo_server import spellcheck  # noqa: F401 — registers routes on import
    from .arbo_server import prompt_storage  # noqa: F401 — registers prompt API routes
    from .arbo_server import prompt_enhance  # noqa: F401 — registers studio/enhance routes
except Exception:
    pass

NODE_CLASS_MAPPINGS = {
    "ArboTools_OptionalLoadImage": OptionalLoadImage,
    "ArboTools_OptionalMergeImages": OptionalMergeImages,
    "ArboTools_JoinTextList": JoinTextList,
    "ArboTools_PromptPair": PromptPair,
    "ArboTools_QualitySwitch": QualitySwitch,
    "ArboTools_PoseBodyMasks": PoseBodyMasks,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ArboTools_OptionalLoadImage": "Load Image (Optional)",
    "ArboTools_OptionalMergeImages": "Merge Images (Optional)",
    "ArboTools_JoinTextList": "Join Text List",
    "ArboTools_PromptPair": "Prompt Pair",
    "ArboTools_QualitySwitch": "Quality Switch",
    "ArboTools_PoseBodyMasks": "Pose Body Masks",
}
WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
