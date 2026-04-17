"""ArboTools_PoseFitCanvas — Rescale and reposition OpenPose keypoints to fit a target canvas.

Takes POSE_KEYPOINT data and transforms it so the skeleton is centered,
properly scaled, and fits within the target resolution with configurable margins.
Outputs transformed POSE_KEYPOINT + re-rendered skeleton image.
"""

import json
import copy
import numpy as np
import torch
from PIL import Image, ImageDraw


# OpenPose body keypoint indices
NOSE = 0
NECK = 1
R_SHOULDER = 2
R_ELBOW = 3
R_WRIST = 4
L_SHOULDER = 5
L_ELBOW = 6
L_WRIST = 7
R_HIP = 8
R_KNEE = 9
R_ANKLE = 10
L_HIP = 11
L_KNEE = 12
L_ANKLE = 13
R_EYE = 14
L_EYE = 15
R_EAR = 16
L_EAR = 17

# Limb connections for rendering (pairs of keypoint indices)
LIMB_PAIRS = [
    (NECK, NOSE), (NECK, R_SHOULDER), (NECK, L_SHOULDER),
    (R_SHOULDER, R_ELBOW), (R_ELBOW, R_WRIST),
    (L_SHOULDER, L_ELBOW), (L_ELBOW, L_WRIST),
    (NECK, R_HIP), (NECK, L_HIP),
    (R_HIP, R_KNEE), (R_KNEE, R_ANKLE),
    (L_HIP, L_KNEE), (L_KNEE, L_ANKLE),
    (NOSE, R_EYE), (NOSE, L_EYE),
    (R_EYE, R_EAR), (L_EYE, L_EAR),
]

# Colors per limb (matching standard OpenPose visualization)
LIMB_COLORS = [
    (255, 0, 0), (255, 85, 0), (255, 170, 0),
    (255, 255, 0), (170, 255, 0),
    (85, 255, 0), (0, 255, 0),
    (0, 255, 85), (0, 255, 170),
    (0, 255, 255), (0, 170, 255),
    (0, 85, 255), (0, 0, 255),
    (85, 0, 255), (170, 0, 255),
    (255, 0, 255), (255, 0, 170),
]

KEYPOINT_COLORS = [
    (255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0),
    (170, 255, 0), (85, 255, 0), (0, 255, 0), (0, 255, 85),
    (0, 255, 170), (0, 255, 255), (0, 170, 255), (0, 85, 255),
    (0, 0, 255), (85, 0, 255), (170, 0, 255), (255, 0, 255),
    (255, 0, 170), (255, 0, 85),
]


def _parse_flat_keypoints(raw):
    """Parse flat list [x1,y1,c1,x2,y2,c2,...] into list of (x,y,c) tuples or None."""
    kps = []
    if raw is None:
        return [None] * 18

    if isinstance(raw, list) and len(raw) > 0:
        if isinstance(raw[0], (list, tuple)):
            # Already nested [[x,y,c], ...]
            for triplet in raw:
                if len(triplet) >= 2:
                    x, y = float(triplet[0]), float(triplet[1])
                    c = float(triplet[2]) if len(triplet) > 2 else 1.0
                    if x == 0 and y == 0 and c == 0:
                        kps.append(None)
                    else:
                        kps.append((x, y, c))
                else:
                    kps.append(None)
        else:
            # Flat [x1, y1, c1, x2, y2, c2, ...]
            for i in range(0, len(raw) - 2, 3):
                x, y, c = float(raw[i]), float(raw[i + 1]), float(raw[i + 2])
                if x == 0 and y == 0 and c == 0:
                    kps.append(None)
                else:
                    kps.append((x, y, c))

    # Pad to 18 if needed
    while len(kps) < 18:
        kps.append(None)
    return kps


def _transform_keypoints(kps, src_w, src_h, dst_w, dst_h, margin_top, margin_bottom, margin_lr, vertical_anchor):
    """Transform keypoints from source canvas to destination canvas.

    Computes bounding box of all valid keypoints, then scales and translates
    to fit within the target canvas with specified margins.

    Args:
        kps: list of (x, y, c) or None, in normalized coords (0-1 of src canvas)
        src_w, src_h: original canvas dimensions
        dst_w, dst_h: target canvas dimensions
        margin_top: top margin as fraction (0-0.5)
        margin_bottom: bottom margin as fraction (0-0.5)
        margin_lr: left/right margin as fraction (0-0.5)
        vertical_anchor: where to anchor vertically ("center", "top", "bottom")

    Returns:
        list of transformed (x_norm, y_norm, c) in normalized coords (0-1 of dst canvas)
    """
    # Convert to pixel coords in source space
    valid_px = []
    for kp in kps:
        if kp is not None:
            valid_px.append((kp[0] * src_w, kp[1] * src_h))

    if not valid_px:
        return kps  # Nothing to transform

    # Compute bounding box
    xs = [p[0] for p in valid_px]
    ys = [p[1] for p in valid_px]
    bbox_x_min, bbox_x_max = min(xs), max(xs)
    bbox_y_min, bbox_y_max = min(ys), max(ys)
    bbox_w = max(bbox_x_max - bbox_x_min, 1)
    bbox_h = max(bbox_y_max - bbox_y_min, 1)

    # Target area (in pixels of dst canvas, accounting for margins)
    target_x_min = dst_w * margin_lr
    target_x_max = dst_w * (1 - margin_lr)
    target_y_min = dst_h * margin_top
    target_y_max = dst_h * (1 - margin_bottom)
    target_w = target_x_max - target_x_min
    target_h = target_y_max - target_y_min

    # Scale to fit (preserve aspect ratio)
    scale_x = target_w / bbox_w
    scale_y = target_h / bbox_h
    scale = min(scale_x, scale_y)

    # Scaled skeleton dimensions
    scaled_w = bbox_w * scale
    scaled_h = bbox_h * scale

    # Center horizontally
    offset_x = target_x_min + (target_w - scaled_w) / 2

    # Vertical positioning based on anchor
    if vertical_anchor == "top":
        offset_y = target_y_min
    elif vertical_anchor == "bottom":
        offset_y = target_y_max - scaled_h
    else:  # center
        offset_y = target_y_min + (target_h - scaled_h) / 2

    # Transform each keypoint
    result = []
    for kp in kps:
        if kp is None:
            result.append(None)
        else:
            px_x = kp[0] * src_w
            px_y = kp[1] * src_h
            # Translate to bbox origin, scale, then offset to target
            new_x = (px_x - bbox_x_min) * scale + offset_x
            new_y = (px_y - bbox_y_min) * scale + offset_y
            # Normalize to dst canvas
            result.append((new_x / dst_w, new_y / dst_h, kp[2]))

    return result


def _render_skeleton(kps_norm, canvas_w, canvas_h, line_width=4):
    """Render OpenPose skeleton as an RGB image (black background)."""
    img = Image.new("RGB", (canvas_w, canvas_h), (0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Convert normalized to pixel
    kps_px = []
    for kp in kps_norm:
        if kp is not None:
            kps_px.append((int(kp[0] * canvas_w), int(kp[1] * canvas_h)))
        else:
            kps_px.append(None)

    # Draw limbs
    for i, (a, b) in enumerate(LIMB_PAIRS):
        if a < len(kps_px) and b < len(kps_px) and kps_px[a] is not None and kps_px[b] is not None:
            color = LIMB_COLORS[i % len(LIMB_COLORS)]
            draw.line([kps_px[a], kps_px[b]], fill=color, width=line_width)

    # Draw keypoints
    r = line_width + 1
    for i, kp in enumerate(kps_px):
        if kp is not None:
            color = KEYPOINT_COLORS[i % len(KEYPOINT_COLORS)]
            draw.ellipse([kp[0] - r, kp[1] - r, kp[0] + r, kp[1] + r], fill=color)

    return img


def _kps_to_flat(kps_norm):
    """Convert list of (x,y,c) or None back to flat list [x1,y1,c1,...]."""
    flat = []
    for kp in kps_norm:
        if kp is None:
            flat.extend([0.0, 0.0, 0.0])
        else:
            flat.extend([float(kp[0]), float(kp[1]), float(kp[2])])
    return flat


class PoseFitCanvas:
    """Rescale and reposition OpenPose keypoints to fit a target canvas.

    Takes any POSE_KEYPOINT and transforms the skeleton to be centered and
    properly scaled within the specified target resolution. Outputs both
    the transformed keypoints and a re-rendered skeleton image.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pose_keypoints": ("POSE_KEYPOINT",),
                "target_width": ("INT", {"default": 768, "min": 64, "max": 4096, "step": 8,
                                         "tooltip": "Target canvas width in pixels"}),
                "target_height": ("INT", {"default": 1152, "min": 64, "max": 4096, "step": 8,
                                          "tooltip": "Target canvas height in pixels"}),
                "margin_top": ("FLOAT", {"default": 0.05, "min": 0.0, "max": 0.4, "step": 0.01,
                                         "tooltip": "Top margin as fraction of canvas height"}),
                "margin_bottom": ("FLOAT", {"default": 0.03, "min": 0.0, "max": 0.4, "step": 0.01,
                                            "tooltip": "Bottom margin as fraction of canvas height"}),
                "margin_sides": ("FLOAT", {"default": 0.05, "min": 0.0, "max": 0.4, "step": 0.01,
                                           "tooltip": "Left/right margin as fraction of canvas width"}),
                "vertical_anchor": (["center", "top", "bottom"], {"default": "center",
                                    "tooltip": "Where to anchor the skeleton vertically"}),
                "line_width": ("INT", {"default": 4, "min": 1, "max": 16, "step": 1,
                                       "tooltip": "Skeleton line thickness for preview"}),
            },
            "optional": {
                "person_index": ("INT", {"default": 0, "min": 0, "max": 10, "step": 1,
                                         "tooltip": "Index of the person to transform (0 = first)"}),
            },
        }

    CATEGORY = "ArboTools/Pose"

    RETURN_TYPES = ("POSE_KEYPOINT", "IMAGE")
    RETURN_NAMES = ("pose_keypoints", "skeleton_image")
    FUNCTION = "fit_canvas"

    def fit_canvas(self, pose_keypoints, target_width=768, target_height=1152,
                   margin_top=0.05, margin_bottom=0.03, margin_sides=0.05,
                   vertical_anchor="center", line_width=4, person_index=0):

        # Parse input
        if isinstance(pose_keypoints, str):
            kp_data = json.loads(pose_keypoints)
        else:
            kp_data = pose_keypoints

        if isinstance(kp_data, list) and len(kp_data) > 0:
            frame = kp_data[0]
        else:
            frame = kp_data

        src_w = int(frame.get("canvas_width", 768))
        src_h = int(frame.get("canvas_height", 768))
        people = frame.get("people", [])

        print(f"[PoseFitCanvas] src={src_w}x{src_h} -> dst={target_width}x{target_height}, "
              f"margins=({margin_top:.0%}, {margin_bottom:.0%}, {margin_sides:.0%}), "
              f"anchor={vertical_anchor}, people={len(people)}")

        if not people or person_index >= len(people):
            print("[PoseFitCanvas] WARNING: No person found")
            empty_img = torch.zeros((1, target_height, target_width, 3), dtype=torch.float32)
            empty_kp = [{"people": [], "canvas_width": target_width, "canvas_height": target_height}]
            return (empty_kp, empty_img)

        # Deep copy to avoid modifying original
        new_frame = copy.deepcopy(frame)
        person = new_frame["people"][person_index]

        # Parse keypoints
        raw = person.get("pose_keypoints_2d", [])
        kps = _parse_flat_keypoints(raw)

        valid_count = sum(1 for k in kps if k is not None)
        print(f"[PoseFitCanvas] {valid_count}/18 keypoints detected")

        # Transform
        transformed = _transform_keypoints(
            kps, src_w, src_h, target_width, target_height,
            margin_top, margin_bottom, margin_sides, vertical_anchor
        )

        # Log transformation
        for i, (old, new) in enumerate(zip(kps, transformed)):
            if old is not None and new is not None:
                print(f"[PoseFitCanvas]   kp[{i:2d}]: ({old[0]:.3f},{old[1]:.3f}) -> ({new[0]:.3f},{new[1]:.3f})")

        # Update keypoints in the frame (flat format)
        person["pose_keypoints_2d"] = _kps_to_flat(transformed)
        new_frame["canvas_width"] = target_width
        new_frame["canvas_height"] = target_height

        # Also transform face/hand keypoints if present
        for key in ["face_keypoints_2d", "hand_left_keypoints_2d", "hand_right_keypoints_2d"]:
            sub_raw = person.get(key)
            if sub_raw and isinstance(sub_raw, list) and len(sub_raw) > 0:
                sub_kps = _parse_flat_keypoints(sub_raw)
                sub_transformed = _transform_keypoints(
                    sub_kps, src_w, src_h, target_width, target_height,
                    margin_top, margin_bottom, margin_sides, vertical_anchor
                )
                person[key] = _kps_to_flat(sub_transformed)

        # Render skeleton
        skeleton_img = _render_skeleton(transformed, target_width, target_height, line_width)
        skeleton_tensor = torch.from_numpy(
            np.array(skeleton_img).astype(np.float32) / 255.0
        ).unsqueeze(0)

        # Output as list (same format as OpenposePreprocessor)
        output_kp = [new_frame]

        return (output_kp, skeleton_tensor)
