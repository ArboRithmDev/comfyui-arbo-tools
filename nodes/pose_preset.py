"""ArboTools_PosePreset — Generate standard pose keypoints (T-pose, A-pose, etc).

Creates POSE_KEYPOINT data for common character sheet poses, with configurable
proportions and canvas dimensions. Feed the output to PoseFitCanvas to adapt
to any target resolution.
"""

import json
import numpy as np
import torch
from PIL import Image, ImageDraw

# Limb connections for rendering
LIMB_PAIRS = [
    (1, 0), (1, 2), (1, 5),        # neck to nose, shoulders
    (2, 3), (3, 4),                 # right arm
    (5, 6), (6, 7),                 # left arm
    (1, 8), (1, 11),               # neck to hips
    (8, 9), (9, 10),               # right leg
    (11, 12), (12, 13),            # left leg
    (0, 14), (0, 15),              # nose to eyes
    (14, 16), (15, 17),            # eyes to ears
]

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


def _generate_tpose(arm_angle=0, leg_spread=0.12, head_ratio=0.12, torso_ratio=0.30,
                     leg_ratio=0.45, shoulder_width=0.18, arm_length_ratio=0.28,
                     body_height=0.82, body_width=1.0):
    """Generate T-pose keypoints in normalized coordinates (0-1).

    Args:
        arm_angle: degrees below horizontal (0 = pure T, 30 = A-pose)
        leg_spread: horizontal spread of legs (fraction of width, from center)
        head_ratio: head height as fraction of total body height
        torso_ratio: torso height as fraction
        leg_ratio: leg height as fraction
        shoulder_width: half shoulder width as fraction of canvas width
        arm_length_ratio: total arm length (shoulder to wrist) as fraction of canvas width
        body_height: total body height as fraction of canvas (0-1)
        body_width: horizontal scale factor (1.0 = full width available)
    """
    import math

    cx = 0.5  # center x

    # Vertical proportions (from top)
    total_body = head_ratio + torso_ratio + leg_ratio
    head_h = head_ratio / total_body
    torso_h = torso_ratio / total_body
    leg_h = leg_ratio / total_body

    # Key Y positions (normalized, with margins)
    margin_top = (1.0 - body_height) / 2  # center vertically

    head_top = margin_top
    nose_y = head_top + head_h * body_height * 0.4
    eye_y = head_top + head_h * body_height * 0.3
    ear_y = head_top + head_h * body_height * 0.35
    neck_y = head_top + head_h * body_height
    shoulder_y = neck_y + 0.02
    hip_y = shoulder_y + torso_h * body_height
    knee_y = hip_y + leg_h * body_height * 0.5
    ankle_y = hip_y + leg_h * body_height

    # Apply body_width scaling to all horizontal measurements
    shoulder_half = shoulder_width * body_width

    # Arm positions (angle from horizontal)
    arm_rad = math.radians(arm_angle)
    total_arm = arm_length_ratio * body_width
    arm_length = total_arm * 0.53  # upper arm = 53% of total arm
    forearm_length = total_arm * 0.47  # forearm = 47% of total arm

    # Right arm (positive x direction from center)
    r_shoulder = (cx - shoulder_half, shoulder_y)
    r_elbow_x = r_shoulder[0] - arm_length * math.cos(arm_rad)
    r_elbow_y = r_shoulder[1] + arm_length * math.sin(arm_rad)
    r_elbow = (r_elbow_x, r_elbow_y)
    r_wrist_x = r_elbow[0] - forearm_length * math.cos(arm_rad)
    r_wrist_y = r_elbow[1] + forearm_length * math.sin(arm_rad)
    r_wrist = (r_wrist_x, r_wrist_y)

    # Left arm (mirror)
    l_shoulder = (cx + shoulder_half, shoulder_y)
    l_elbow = (cx + (cx - r_elbow[0]), r_elbow[1])
    l_wrist = (cx + (cx - r_wrist[0]), r_wrist[1])

    # Legs (apply body_width to spread)
    spread = leg_spread * body_width
    r_hip = (cx - spread, hip_y)
    l_hip = (cx + spread, hip_y)
    r_knee = (cx - spread, knee_y)
    l_knee = (cx + spread, knee_y)
    r_ankle = (cx - spread, ankle_y)
    l_ankle = (cx + spread, ankle_y)

    # Head details
    eye_spread = 0.025 * body_width
    ear_spread = 0.045 * body_width

    # Build keypoints: [nose, neck, r_shoulder, r_elbow, r_wrist,
    #                    l_shoulder, l_elbow, l_wrist,
    #                    r_hip, r_knee, r_ankle, l_hip, l_knee, l_ankle,
    #                    r_eye, l_eye, r_ear, l_ear]
    keypoints = [
        (cx, nose_y),           # 0: nose
        (cx, neck_y),           # 1: neck
        r_shoulder,             # 2: r_shoulder
        r_elbow,                # 3: r_elbow
        r_wrist,                # 4: r_wrist
        l_shoulder,             # 5: l_shoulder
        l_elbow,                # 6: l_elbow
        l_wrist,                # 7: l_wrist
        r_hip,                  # 8: r_hip
        r_knee,                 # 9: r_knee
        r_ankle,                # 10: r_ankle
        l_hip,                  # 11: l_hip
        l_knee,                 # 12: l_knee
        l_ankle,                # 13: l_ankle
        (cx - eye_spread, eye_y),   # 14: r_eye
        (cx + eye_spread, eye_y),   # 15: l_eye
        (cx - ear_spread, ear_y),   # 16: r_ear
        (cx + ear_spread, ear_y),   # 17: l_ear
    ]

    return keypoints


def _render_skeleton(keypoints, canvas_w, canvas_h, line_width=4):
    """Render skeleton image from normalized keypoints."""
    img = Image.new("RGB", (canvas_w, canvas_h), (0, 0, 0))
    draw = ImageDraw.Draw(img)

    kps_px = [(int(x * canvas_w), int(y * canvas_h)) for x, y in keypoints]

    for i, (a, b) in enumerate(LIMB_PAIRS):
        if a < len(kps_px) and b < len(kps_px):
            color = LIMB_COLORS[i % len(LIMB_COLORS)]
            draw.line([kps_px[a], kps_px[b]], fill=color, width=line_width)

    r = line_width + 1
    for i, kp in enumerate(kps_px):
        color = KEYPOINT_COLORS[i % len(KEYPOINT_COLORS)]
        draw.ellipse([kp[0] - r, kp[1] - r, kp[0] + r, kp[1] + r], fill=color)

    return img


def _keypoints_to_flat(keypoints):
    """Convert [(x,y), ...] to flat [x1,y1,c1,x2,y2,c2,...]."""
    flat = []
    for x, y in keypoints:
        flat.extend([float(x), float(y), 1.0])
    return flat


class PosePreset:
    """Generate standard pose keypoints for character sheets.

    Creates POSE_KEYPOINT + skeleton IMAGE for common poses (T-pose, A-pose).
    The skeleton is perfectly centered and proportioned for the target canvas.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pose": (["T-Pose", "A-Pose (30°)", "A-Pose (45°)", "Arms Down"], {"default": "T-Pose"}),
                "canvas_width": ("INT", {"default": 768, "min": 64, "max": 4096, "step": 8}),
                "canvas_height": ("INT", {"default": 1152, "min": 64, "max": 4096, "step": 8}),
                "leg_spread": ("FLOAT", {"default": 0.10, "min": 0.0, "max": 0.3, "step": 0.01,
                                         "tooltip": "Horizontal spread of legs from center"}),
                "head_size": ("FLOAT", {"default": 0.12, "min": 0.05, "max": 0.25, "step": 0.01,
                                        "tooltip": "Head height as fraction of body"}),
                "torso_length": ("FLOAT", {"default": 0.30, "min": 0.15, "max": 0.45, "step": 0.01,
                                           "tooltip": "Torso height as fraction of body"}),
                "leg_length": ("FLOAT", {"default": 0.45, "min": 0.25, "max": 0.60, "step": 0.01,
                                         "tooltip": "Leg height as fraction of body"}),
                "shoulder_width": ("FLOAT", {"default": 0.18, "min": 0.08, "max": 0.30, "step": 0.01,
                                            "tooltip": "Half shoulder width as fraction of canvas"}),
                "arm_length": ("FLOAT", {"default": 0.28, "min": 0.10, "max": 0.45, "step": 0.01,
                                         "tooltip": "Total arm length (shoulder to wrist) as fraction of canvas width"}),
                "body_height": ("FLOAT", {"default": 0.82, "min": 0.3, "max": 0.98, "step": 0.01,
                                          "tooltip": "Total body height as fraction of canvas (lower = more margin)"}),
                "body_width": ("FLOAT", {"default": 1.0, "min": 0.3, "max": 1.5, "step": 0.01,
                                         "tooltip": "Horizontal scale (1.0 = default, <1 = narrower, >1 = wider)"}),
                "line_width": ("INT", {"default": 4, "min": 1, "max": 16, "step": 1}),
            },
        }

    CATEGORY = "ArboTools/Pose"

    RETURN_TYPES = ("POSE_KEYPOINT", "IMAGE")
    RETURN_NAMES = ("pose_keypoints", "skeleton_image")
    FUNCTION = "generate_pose"

    def generate_pose(self, pose, canvas_width, canvas_height, leg_spread,
                      head_size, torso_length, leg_length, shoulder_width, arm_length,
                      body_height, body_width, line_width):

        # Map pose name to arm angle
        arm_angles = {
            "T-Pose": 0,
            "A-Pose (30°)": 30,
            "A-Pose (45°)": 45,
            "Arms Down": 80,
        }
        arm_angle = arm_angles.get(pose, 0)

        # Generate keypoints
        keypoints = _generate_tpose(
            arm_angle=arm_angle,
            leg_spread=leg_spread,
            head_ratio=head_size,
            torso_ratio=torso_length,
            leg_ratio=leg_length,
            shoulder_width=shoulder_width,
            arm_length_ratio=arm_length,
            body_height=body_height,
            body_width=body_width,
        )

        # Build POSE_KEYPOINT structure
        pose_data = [{
            "people": [{
                "pose_keypoints_2d": _keypoints_to_flat(keypoints),
                "face_keypoints_2d": [],
                "hand_left_keypoints_2d": [],
                "hand_right_keypoints_2d": [],
            }],
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
        }]

        # Render skeleton
        skeleton_img = _render_skeleton(keypoints, canvas_width, canvas_height, line_width)
        skeleton_tensor = torch.from_numpy(
            np.array(skeleton_img).astype(np.float32) / 255.0
        ).unsqueeze(0)

        print(f"[PosePreset] Generated {pose} at {canvas_width}x{canvas_height}, "
              f"legs={leg_spread:.2f}, head={head_size:.2f}, torso={torso_length:.2f}, legs_len={leg_length:.2f}")

        return (pose_data, skeleton_tensor)
