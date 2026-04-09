"""Arbo Tools — Custom utility nodes for ComfyUI."""

from .nodes.optional_load_image import OptionalLoadImage
from .nodes.optional_merge_images import OptionalMergeImages
from .nodes.join_text_list import JoinTextList

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
WEB_DIRECTORY = None
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
