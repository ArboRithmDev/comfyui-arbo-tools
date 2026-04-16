"""ArboTools_PoseBodyMasks — Generate body-zone masks from OpenPose keypoints.

Takes POSE_KEYPOINT data from OpenposePreprocessor and generates individual
masks for each body zone. Masks follow the actual body position and proportions.

POSE_KEYPOINT format (from OpenposePreprocessor):
[{
    "people": [{
        "pose_keypoints_2d": [x1, y1, c1, x2, y2, c2, ...],  # FLAT list, 18 keypoints * 3 = 54 values
    }],
    "canvas_height": H,
    "canvas_width": W,
}]

Coordinates are in PIXELS (not normalized 0-1).
"""

import json
import logging
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter


# OpenPose body keypoint indices (COCO 18-point format)
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

logger = logging.getLogger("ArboTools.PoseBodyMasks")


def _parse_keypoints(person):
    """Parse flat keypoints list into dict of {index: (x_px, y_px, conf)} or None."""
    raw = person.get("pose_keypoints_2d")
    if raw is None:
        return {}

    # Handle both flat list [x1,y1,c1,x2,y2,c2,...] and nested [[x1,y1,c1],[x2,y2,c2],...]
    kps = {}
    if isinstance(raw, list) and len(raw) > 0:
        if isinstance(raw[0], (list, tuple)):
            # Nested format
            for i, triplet in enumerate(raw):
                if len(triplet) >= 2:
                    x, y = float(triplet[0]), float(triplet[1])
                    c = float(triplet[2]) if len(triplet) > 2 else 1.0
                    if x == 0 and y == 0 and c == 0:
                        continue
                    kps[i] = (x, y, c)
        else:
            # Flat format: [x1, y1, c1, x2, y2, c2, ...]
            for i in range(0, len(raw) - 2, 3):
                idx = i // 3
                x, y, c = float(raw[i]), float(raw[i + 1]), float(raw[i + 2])
                if x == 0 and y == 0 and c == 0:
                    continue
                kps[idx] = (x, y, c)

    return kps


def _dist(kps, i1, i2):
    """Pixel distance between two keypoints."""
    if i1 not in kps or i2 not in kps:
        return 0
    p1, p2 = kps[i1], kps[i2]
    return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5


def _draw_poly(draw, points, pad=0):
    """Draw filled polygon from pixel coordinate tuples. Pad expands outward."""
    valid = [(x, y) for x, y in points if x is not None and y is not None]
    if len(valid) < 3:
        return
    # Simple padding: expand each point away from centroid
    if pad > 0:
        cx = sum(p[0] for p in valid) / len(valid)
        cy = sum(p[1] for p in valid) / len(valid)
        expanded = []
        for x, y in valid:
            dx, dy = x - cx, y - cy
            d = max((dx ** 2 + dy ** 2) ** 0.5, 1)
            expanded.append((x + dx / d * pad, y + dy / d * pad))
        valid = expanded
    draw.polygon(valid, fill=255)


def _draw_limb(draw, p1, p2, width):
    """Draw a thick line (rotated rectangle) between two pixel points."""
    if p1 is None or p2 is None:
        return
    x1, y1 = p1
    x2, y2 = p2
    dx, dy = x2 - x1, y2 - y1
    length = max((dx ** 2 + dy ** 2) ** 0.5, 1)
    nx, ny = -dy / length * width / 2, dx / length * width / 2
    draw.polygon([
        (x1 + nx, y1 + ny), (x1 - nx, y1 - ny),
        (x2 - nx, y2 - ny), (x2 + nx, y2 + ny),
    ], fill=255)


def _draw_ellipse(draw, cx, cy, rx, ry):
    """Draw filled ellipse centered at (cx, cy) with radii rx, ry."""
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)


def _kp_xy(kps, idx):
    """Get (x, y) pixel tuple for a keypoint, or None."""
    if idx in kps:
        return (kps[idx][0], kps[idx][1])
    return None


def _generate_masks(kps, canvas_w, canvas_h, padding_px):
    """Generate all body zone masks from parsed keypoints (pixel coords)."""

    pad = padding_px

    # Estimate body scale from shoulder width
    shoulder_w = _dist(kps, R_SHOULDER, L_SHOULDER)
    if shoulder_w == 0:
        shoulder_w = canvas_w * 0.25  # fallback
    limb_w = shoulder_w * 0.4  # limb mask width

    masks = {}

    # --- HEAD ---
    img = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(img)
    nose = _kp_xy(kps, NOSE)
    neck = _kp_xy(kps, NECK)
    if nose:
        head_r = shoulder_w * 0.45
        _draw_ellipse(draw, nose[0], nose[1] - head_r * 0.2, head_r + pad, head_r * 1.3 + pad)
    masks["head"] = img

    # --- NECK ---
    img = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(img)
    if neck and (R_SHOULDER in kps or L_SHOULDER in kps):
        rs = _kp_xy(kps, R_SHOULDER) or _kp_xy(kps, L_SHOULDER)
        ls = _kp_xy(kps, L_SHOULDER) or _kp_xy(kps, R_SHOULDER)
        neck_w = shoulder_w * 0.25
        top_y = neck[1] - shoulder_w * 0.1
        bot_y = (rs[1] + ls[1]) / 2
        _draw_poly(draw, [
            (neck[0] - neck_w, top_y),
            (neck[0] + neck_w, top_y),
            (neck[0] + neck_w, bot_y),
            (neck[0] - neck_w, bot_y),
        ], pad)
    masks["neck"] = img

    # --- TORSO ---
    img = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(img)
    rs = _kp_xy(kps, R_SHOULDER)
    ls = _kp_xy(kps, L_SHOULDER)
    rh = _kp_xy(kps, R_HIP)
    lh = _kp_xy(kps, L_HIP)
    if rs and ls and (rh or lh):
        rh = rh or lh
        lh = lh or rh
        _draw_poly(draw, [rs, ls, lh, rh], pad)
    masks["torso"] = img

    # --- ARMS ---
    for side, sh_idx, el_idx, wr_idx, prefix in [
        ("right", R_SHOULDER, R_ELBOW, R_WRIST, "right_arm"),
        ("left", L_SHOULDER, L_ELBOW, L_WRIST, "left_arm"),
    ]:
        # Upper arm
        img = Image.new("L", (canvas_w, canvas_h), 0)
        draw = ImageDraw.Draw(img)
        _draw_limb(draw, _kp_xy(kps, sh_idx), _kp_xy(kps, el_idx), limb_w + pad * 2)
        masks[f"{prefix}_upper"] = img

        # Forearm
        img = Image.new("L", (canvas_w, canvas_h), 0)
        draw = ImageDraw.Draw(img)
        _draw_limb(draw, _kp_xy(kps, el_idx), _kp_xy(kps, wr_idx), limb_w * 0.8 + pad * 2)
        masks[f"{prefix}_lower"] = img

    # --- PELVIS ---
    img = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(img)
    if rh and lh:
        rk = _kp_xy(kps, R_KNEE) or _kp_xy(kps, L_KNEE)
        lk = _kp_xy(kps, L_KNEE) or _kp_xy(kps, R_KNEE)
        if rk and lk:
            mid_knee_y = (rk[1] + lk[1]) / 2
            pelvis_bot = rh[1] + (mid_knee_y - rh[1]) * 0.3
        else:
            pelvis_bot = rh[1] + shoulder_w * 0.3
        _draw_poly(draw, [
            (rh[0] - pad, rh[1] - pad),
            (lh[0] + pad, lh[1] - pad),
            (lh[0] + pad * 1.5, pelvis_bot + pad),
            (rh[0] - pad * 1.5, pelvis_bot + pad),
        ], pad)
    masks["pelvis"] = img

    # --- LEGS ---
    for side, hip_idx, knee_idx, ankle_idx, prefix in [
        ("right", R_HIP, R_KNEE, R_ANKLE, "right_leg"),
        ("left", L_HIP, L_KNEE, L_ANKLE, "left_leg"),
    ]:
        # Upper leg
        img = Image.new("L", (canvas_w, canvas_h), 0)
        draw = ImageDraw.Draw(img)
        _draw_limb(draw, _kp_xy(kps, hip_idx), _kp_xy(kps, knee_idx), limb_w * 1.2 + pad * 2)
        masks[f"{prefix}_upper"] = img

        # Lower leg
        img = Image.new("L", (canvas_w, canvas_h), 0)
        draw = ImageDraw.Draw(img)
        _draw_limb(draw, _kp_xy(kps, knee_idx), _kp_xy(kps, ankle_idx), limb_w * 0.9 + pad * 2)
        masks[f"{prefix}_lower"] = img

    # --- FEET ---
    img = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(img)
    foot_w = shoulder_w * 0.35
    foot_h = shoulder_w * 0.5
    for ankle_idx in [R_ANKLE, L_ANKLE]:
        ankle = _kp_xy(kps, ankle_idx)
        if ankle:
            _draw_ellipse(draw, ankle[0], ankle[1] + foot_h * 0.3,
                          foot_w + pad, foot_h + pad)
    masks["feet"] = img

    # --- COMPOSITE ZONES ---
    def _union(names):
        result = np.zeros((canvas_h, canvas_w), dtype=np.uint8)
        for name in names:
            if name in masks:
                result = np.maximum(result, np.array(masks[name]))
        return Image.fromarray(result)

    masks["arms"] = _union(["right_arm_upper", "right_arm_lower", "left_arm_upper", "left_arm_lower"])
    masks["legs"] = _union(["right_leg_upper", "right_leg_lower", "left_leg_upper", "left_leg_lower"])
    masks["upper_body"] = _union(["head", "neck", "torso", "right_arm_upper", "right_arm_lower", "left_arm_upper", "left_arm_lower"])
    masks["lower_body"] = _union(["pelvis", "right_leg_upper", "right_leg_lower", "left_leg_upper", "left_leg_lower", "feet"])
    masks["full_body"] = _union(list(masks.keys()))

    return masks


def _pil_to_mask(pil_img, feather=0):
    """Convert PIL L-mode image to ComfyUI mask tensor [1, H, W]."""
    if feather > 0:
        pil_img = pil_img.filter(ImageFilter.GaussianBlur(radius=feather))
    arr = np.array(pil_img).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


class PoseBodyMasks:
    """Generate body-zone masks from OpenPose keypoints.

    Takes POSE_KEYPOINT from OpenposePreprocessor and outputs individual
    masks for each body zone. Masks dynamically follow the detected pose.
    Coordinates are in pixels, matching the canvas_width/canvas_height.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pose_keypoints": ("POSE_KEYPOINT",),
                "person_index": ("INT", {"default": 0, "min": 0, "max": 10, "step": 1,
                                         "tooltip": "Index of the person to use (0 = first detected)"}),
                "padding": ("FLOAT", {"default": 5.0, "min": 0.0, "max": 50.0, "step": 1.0,
                                      "tooltip": "Padding around each zone in pixels"}),
                "feather": ("INT", {"default": 8, "min": 0, "max": 64, "step": 1,
                                    "tooltip": "Gaussian blur radius for smooth mask edges"}),
            },
        }

    CATEGORY = "ArboTools/Pose"

    RETURN_TYPES = ("MASK",) * 18
    RETURN_NAMES = (
        "head", "neck", "torso",
        "right_arm_upper", "right_arm_lower",
        "left_arm_upper", "left_arm_lower",
        "arms",
        "pelvis",
        "right_leg_upper", "right_leg_lower",
        "left_leg_upper", "left_leg_lower",
        "legs", "feet",
        "upper_body", "lower_body", "full_body",
    )
    FUNCTION = "generate_masks"

    def generate_masks(self, pose_keypoints, person_index=0, padding=5.0, feather=8):
        # Parse keypoints — can be JSON string or list
        if isinstance(pose_keypoints, str):
            kp_data = json.loads(pose_keypoints)
        else:
            kp_data = pose_keypoints

        # Get first frame
        if isinstance(kp_data, list) and len(kp_data) > 0:
            frame = kp_data[0]
        else:
            frame = kp_data

        canvas_w = int(frame.get("canvas_width", 768))
        canvas_h = int(frame.get("canvas_height", 1152))
        people = frame.get("people", [])

        # Debug: print raw data type and structure
        print(f"[PoseBodyMasks] pose_keypoints type: {type(pose_keypoints)}")
        if isinstance(kp_data, list):
            print(f"[PoseBodyMasks] kp_data length: {len(kp_data)}")
            if len(kp_data) > 0:
                frame_keys = list(kp_data[0].keys()) if isinstance(kp_data[0], dict) else f"not a dict: {type(kp_data[0])}"
                print(f"[PoseBodyMasks] frame[0] keys: {frame_keys}")
        elif isinstance(kp_data, dict):
            print(f"[PoseBodyMasks] kp_data is dict with keys: {list(kp_data.keys())}")
        else:
            print(f"[PoseBodyMasks] kp_data is: {type(kp_data)} = {str(kp_data)[:200]}")

        print(f"[PoseBodyMasks] canvas={canvas_w}x{canvas_h}, people={len(people)}, person_index={person_index}")

        if not people or person_index >= len(people):
            print(f"[PoseBodyMasks] WARNING: No person detected — returning empty masks")
            empty = torch.zeros((1, canvas_h, canvas_w), dtype=torch.float32)
            return tuple([empty] * 18)

        person = people[person_index]

        # Debug: show raw keypoints
        raw_kps = person.get("pose_keypoints_2d")
        if raw_kps:
            print(f"[PoseBodyMasks] raw pose_keypoints_2d type={type(raw_kps)}, len={len(raw_kps)}")
            print(f"[PoseBodyMasks] first 12 values: {raw_kps[:12]}")
        else:
            print(f"[PoseBodyMasks] pose_keypoints_2d is None or missing! person keys: {list(person.keys())}")

        kps = _parse_keypoints(person)

        print(f"[PoseBodyMasks] parsed {len(kps)} keypoints: {sorted(kps.keys())}")
        for idx, (x, y, c) in sorted(kps.items()):
            print(f"[PoseBodyMasks]   kp[{idx}]: x={x:.1f}, y={y:.1f}, conf={c:.2f}")

        if len(kps) < 4:
            logger.warning(f"PoseBodyMasks: Only {len(kps)} keypoints detected — masks will be incomplete")

        masks = _generate_masks(kps, canvas_w, canvas_h, padding)

        output_order = [
            "head", "neck", "torso",
            "right_arm_upper", "right_arm_lower",
            "left_arm_upper", "left_arm_lower",
            "arms",
            "pelvis",
            "right_leg_upper", "right_leg_lower",
            "left_leg_upper", "left_leg_lower",
            "legs", "feet",
            "upper_body", "lower_body", "full_body",
        ]

        return tuple(_pil_to_mask(masks[name], feather) for name in output_order)
