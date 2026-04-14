"""QualitySwitch — Toggle between Draft and HQ settings for fast iteration."""


class QualitySwitch:
    """Switch between Draft (fast preview) and HQ (final render) settings.

    Outputs steps, cfg, resolution, and denoise values based on the selected mode.
    Connect outputs to KSampler and latent size nodes.
    Use the same seed to reproduce a draft in high quality.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mode": (["Draft", "HQ"],),
                "draft_steps": ("INT", {"default": 8, "min": 1, "max": 100}),
                "hq_steps": ("INT", {"default": 30, "min": 1, "max": 200}),
                "draft_cfg": ("FLOAT", {"default": 5.0, "min": 0.0, "max": 30.0, "step": 0.5}),
                "hq_cfg": ("FLOAT", {"default": 7.0, "min": 0.0, "max": 30.0, "step": 0.5}),
                "draft_width": ("INT", {"default": 512, "min": 64, "max": 8192, "step": 64}),
                "hq_width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 64}),
                "draft_height": ("INT", {"default": 512, "min": 64, "max": 8192, "step": 64}),
                "hq_height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 64}),
                "draft_denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05}),
                "hq_denoise": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 1.0, "step": 0.05}),
            },
        }

    RETURN_TYPES = ("INT", "FLOAT", "INT", "INT", "FLOAT", "STRING")
    RETURN_NAMES = ("steps", "cfg", "width", "height", "denoise", "mode")
    FUNCTION = "execute"
    CATEGORY = "ArboTools/Utils"

    def execute(self, mode, draft_steps, hq_steps, draft_cfg, hq_cfg,
                draft_width, hq_width, draft_height, hq_height,
                draft_denoise, hq_denoise):

        if mode == "HQ":
            return (hq_steps, hq_cfg, hq_width, hq_height, hq_denoise, "HQ")
        else:
            return (draft_steps, draft_cfg, draft_width, draft_height, draft_denoise, "Draft")
