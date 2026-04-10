"""Arbo Tools — Custom utility nodes for ComfyUI."""

import sys

from .nodes.optional_load_image import OptionalLoadImage
from .nodes.optional_merge_images import OptionalMergeImages
from .nodes.join_text_list import JoinTextList

# Register server routes (spellcheck endpoint) when running inside ComfyUI
if "comfy" in sys.modules or "server" in sys.modules:
    try:
        from .server import spellcheck  # noqa: F401 — registers routes on import
    except Exception:
        pass

NODE_CLASS_MAPPINGS = {
    "ArboTools_OptionalLoadImage": OptionalLoadImage,
    "ArboTools_OptionalMergeImages": OptionalMergeImages,
    "ArboTools_JoinTextList": JoinTextList,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ArboTools_OptionalLoadImage": "Load Image (Optional)",
    "ArboTools_OptionalMergeImages": "Merge Images (Optional)",
    "ArboTools_JoinTextList": "Join Text List",
}
WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
