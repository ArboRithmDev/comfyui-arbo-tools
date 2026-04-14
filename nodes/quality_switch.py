"""QualitySwitch — Toggle between Draft and HQ render settings."""


class QualitySwitch:
    """Switch between Draft (fast preview) and HQ (final render) settings.

    Outputs steps, upscale steps, resolution, and megapixels based on mode.
    Connect outputs to KSampler and latent/upscale nodes.
    Use the same seed to reproduce a draft in high quality.
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
        }

    RETURN_TYPES = ("INT", "INT", "INT", "INT", "FLOAT", "STRING")
    RETURN_NAMES = ("steps", "upscale_steps", "width", "height", "megapixels", "mode")
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Utils"

    def execute(self, mode,
                draft_steps, hq_steps,
                draft_upscale_steps, hq_upscale_steps,
                draft_width, hq_width,
                draft_height, hq_height,
                draft_megapixels, hq_megapixels):

        if mode == "HQ":
            return (hq_steps, hq_upscale_steps, hq_width, hq_height, hq_megapixels, "HQ")
        else:
            return (draft_steps, draft_upscale_steps, draft_width, draft_height, draft_megapixels, "Draft")
