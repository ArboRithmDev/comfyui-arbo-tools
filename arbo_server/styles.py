"""Style presets — curated prompt style templates."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from aiohttp import web

try:
    from server import PromptServer
    routes = PromptServer.instance.routes
except Exception:
    routes = web.RouteTableDef()

_STYLES_DIR = Path(__file__).parent.parent.parent.parent / "user" / "default" / "prompts" / "_styles"


def _ensure_dir():
    _STYLES_DIR.mkdir(parents=True, exist_ok=True)


def list_styles(model_family: str = "") -> list[dict[str, Any]]:
    """List all style presets, optionally filtered by model family."""
    _ensure_dir()
    results = []
    for f in sorted(_STYLES_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if model_family and model_family not in data.get("model_families", []):
                continue
            data["id"] = f.stem
            results.append(data)
        except Exception:
            pass
    return results


def list_style_categories() -> list[str]:
    """List unique style categories."""
    cats = set()
    for s in list_styles():
        cat = s.get("category", "")
        if cat:
            cats.add(cat)
    return sorted(cats)


def save_style(style_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Save a style preset."""
    _ensure_dir()
    path = _STYLES_DIR / f"{style_id}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"status": "saved", "id": style_id}


def delete_style(style_id: str) -> dict[str, Any]:
    """Delete a style preset."""
    path = _STYLES_DIR / f"{style_id}.json"
    if path.exists():
        path.unlink()
        return {"status": "deleted"}
    return {"error": "not found"}


# ── REST endpoints ───────────────────────────────────────────────────


@routes.get("/arbo-tools/styles")
async def api_list_styles(request: web.Request) -> web.Response:
    family = request.query.get("family", "")
    return web.json_response(list_styles(family))


@routes.get("/arbo-tools/styles/categories")
async def api_style_categories(_request: web.Request) -> web.Response:
    return web.json_response(list_style_categories())


@routes.post("/arbo-tools/styles")
async def api_save_style(request: web.Request) -> web.Response:
    body = await request.json()
    style_id = body.get("id", "").strip()
    if not style_id:
        return web.json_response({"error": "id required"}, status=400)
    return web.json_response(save_style(style_id, body))


@routes.delete("/arbo-tools/styles/{style_id}")
async def api_delete_style(request: web.Request) -> web.Response:
    return web.json_response(delete_style(request.match_info["style_id"]))
