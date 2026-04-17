"""Snippets — reusable prompt fragments organized by category."""

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

_SNIPPETS_DIR = Path(__file__).parent.parent.parent.parent / "user" / "default" / "prompts" / "_snippets"


def _ensure_dir():
    _SNIPPETS_DIR.mkdir(parents=True, exist_ok=True)


def list_snippet_categories() -> list[str]:
    """List all snippet category directories."""
    _ensure_dir()
    return sorted(d.name for d in _SNIPPETS_DIR.iterdir() if d.is_dir() and not d.name.startswith("."))


def list_snippets(category: str = "") -> list[dict[str, str]]:
    """List snippets, optionally filtered by category."""
    _ensure_dir()
    results = []
    dirs = [_SNIPPETS_DIR / category] if category else [d for d in _SNIPPETS_DIR.iterdir() if d.is_dir()]

    for d in dirs:
        if not d.exists():
            continue
        cat = d.name
        for f in sorted(d.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                results.append({
                    "name": f.stem,
                    "category": cat,
                    "text": data.get("text", ""),
                })
            except Exception:
                pass
    return results


def save_snippet(name: str, category: str, text: str) -> dict[str, Any]:
    """Save a snippet."""
    _ensure_dir()
    cat_dir = _SNIPPETS_DIR / category
    cat_dir.mkdir(parents=True, exist_ok=True)
    path = cat_dir / f"{name}.json"
    path.write_text(json.dumps({"text": text}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "saved", "name": name, "category": category}


def delete_snippet(name: str, category: str) -> dict[str, Any]:
    """Delete a snippet."""
    path = _SNIPPETS_DIR / category / f"{name}.json"
    if path.exists():
        path.unlink()
        return {"status": "deleted"}
    return {"error": "not found"}


# ── REST endpoints ───────────────────────────────────────────────────


@routes.get("/arbo-tools/snippets")
async def api_list_snippets(request: web.Request) -> web.Response:
    category = request.query.get("category", "")
    return web.json_response(list_snippets(category))


@routes.get("/arbo-tools/snippets/categories")
async def api_snippet_categories(_request: web.Request) -> web.Response:
    return web.json_response(list_snippet_categories())


@routes.post("/arbo-tools/snippets")
async def api_save_snippet(request: web.Request) -> web.Response:
    body = await request.json()
    name = body.get("name", "").strip()
    category = body.get("category", "").strip()
    text = body.get("text", "").strip()
    if not name or not category:
        return web.json_response({"error": "name and category required"}, status=400)
    return web.json_response(save_snippet(name, category, text))


@routes.delete("/arbo-tools/snippets/{category}/{name}")
async def api_delete_snippet(request: web.Request) -> web.Response:
    return web.json_response(delete_snippet(request.match_info["name"], request.match_info["category"]))
