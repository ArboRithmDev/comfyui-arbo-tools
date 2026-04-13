"""Prompt storage — persistent JSON-based prompt library with categories."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from aiohttp import web

try:
    from server import PromptServer
    routes = PromptServer.instance.routes
except Exception:
    routes = web.RouteTableDef()

_DATA_DIR = Path(__file__).parent.parent / "data"
_PROMPTS_FILE = _DATA_DIR / "prompts.json"
_NEGLIB_FILE = _DATA_DIR / "negative_library.json"


# ── Data access ──────────────────────────────────────────────────────


def _ensure_data_dir():
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_prompts() -> dict[str, Any]:
    _ensure_data_dir()
    if _PROMPTS_FILE.exists():
        return json.loads(_PROMPTS_FILE.read_text(encoding="utf-8"))
    return {"categories": [], "prompts": []}


def _save_prompts(data: dict[str, Any]):
    _ensure_data_dir()
    _PROMPTS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _load_neglib() -> list[dict[str, Any]]:
    _ensure_data_dir()
    if _NEGLIB_FILE.exists():
        return json.loads(_NEGLIB_FILE.read_text(encoding="utf-8"))
    # Default negative prompts
    defaults = [
        {"id": "default_quality", "name": "Low quality", "text": "low quality, worst quality, blurry, jpeg artifacts, watermark, text, logo"},
        {"id": "default_anatomy", "name": "Bad anatomy", "text": "bad anatomy, bad hands, extra fingers, missing fingers, deformed, mutated, disfigured, extra limbs"},
        {"id": "default_nsfw", "name": "Content safety", "text": "nsfw, nude, naked, explicit, suggestive"},
    ]
    _NEGLIB_FILE.write_text(json.dumps(defaults, indent=2, ensure_ascii=False), encoding="utf-8")
    return defaults


def _save_neglib(data: list[dict[str, Any]]):
    _ensure_data_dir()
    _NEGLIB_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Prompt helpers ───────────────────────────────────────────────────


def list_prompt_names() -> list[str]:
    """Return flat list of 'category/name' paths for combo widgets."""
    data = _load_prompts()
    names = []
    for p in data.get("prompts", []):
        path = p.get("category", "")
        name = p.get("name", "")
        if path:
            names.append(f"{path}/{name}")
        else:
            names.append(name)
    return sorted(names)


def get_prompt_by_path(path: str) -> dict[str, Any] | None:
    """Find a prompt by its category/name path."""
    data = _load_prompts()
    for p in data.get("prompts", []):
        cat = p.get("category", "")
        name = p.get("name", "")
        full = f"{cat}/{name}" if cat else name
        if full == path:
            return p
    return None


def list_neglib_names() -> list[str]:
    """Return flat list of negative library preset names."""
    lib = _load_neglib()
    return [e.get("name", "") for e in lib]


def get_neglib_text(name: str) -> str:
    """Get negative library text by name."""
    lib = _load_neglib()
    for e in lib:
        if e.get("name") == name:
            return e.get("text", "")
    return ""


# ── REST endpoints ───────────────────────────────────────────────────


@routes.get("/arbo-tools/prompts")
async def api_list_prompts(_request: web.Request) -> web.Response:
    return web.json_response(_load_prompts())


@routes.post("/arbo-tools/prompts")
async def api_save_prompt(request: web.Request) -> web.Response:
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return web.json_response({"error": "name is required"}, status=400)

    data = _load_prompts()
    prompt_entry = {
        "id": body.get("id") or str(uuid.uuid4())[:8],
        "name": name,
        "category": body.get("category", "").strip(),
        "positive": body.get("positive", ""),
        "negative": body.get("negative", ""),
        "tags": body.get("tags", []),
        "created_at": body.get("created_at") or time.strftime("%Y-%m-%dT%H:%M:%S"),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    # Update existing or add new
    existing_idx = None
    for i, p in enumerate(data["prompts"]):
        if p.get("id") == prompt_entry["id"]:
            existing_idx = i
            break

    if existing_idx is not None:
        prompt_entry["created_at"] = data["prompts"][existing_idx].get("created_at", prompt_entry["created_at"])
        data["prompts"][existing_idx] = prompt_entry
    else:
        data["prompts"].append(prompt_entry)

    _save_prompts(data)
    return web.json_response({"status": "saved", "prompt": prompt_entry})


@routes.delete("/arbo-tools/prompts/{prompt_id}")
async def api_delete_prompt(request: web.Request) -> web.Response:
    prompt_id = request.match_info["prompt_id"]
    data = _load_prompts()
    data["prompts"] = [p for p in data["prompts"] if p.get("id") != prompt_id]
    _save_prompts(data)
    return web.json_response({"status": "deleted"})


@routes.get("/arbo-tools/prompts/names")
async def api_prompt_names(_request: web.Request) -> web.Response:
    return web.json_response(list_prompt_names())


@routes.get("/arbo-tools/prompts/categories")
async def api_categories(_request: web.Request) -> web.Response:
    data = _load_prompts()
    cats = set()
    for p in data.get("prompts", []):
        cat = p.get("category", "")
        if cat:
            # Add all parent levels too
            parts = cat.split("/")
            for i in range(1, len(parts) + 1):
                cats.add("/".join(parts[:i]))
    return web.json_response(sorted(cats))


@routes.get("/arbo-tools/neglib")
async def api_list_neglib(_request: web.Request) -> web.Response:
    return web.json_response(_load_neglib())


@routes.post("/arbo-tools/neglib")
async def api_save_neglib_entry(request: web.Request) -> web.Response:
    body = await request.json()
    name = body.get("name", "").strip()
    text = body.get("text", "").strip()
    if not name:
        return web.json_response({"error": "name is required"}, status=400)

    lib = _load_neglib()
    entry_id = body.get("id") or str(uuid.uuid4())[:8]

    existing_idx = None
    for i, e in enumerate(lib):
        if e.get("id") == entry_id or e.get("name") == name:
            existing_idx = i
            break

    entry = {"id": entry_id, "name": name, "text": text}
    if existing_idx is not None:
        lib[existing_idx] = entry
    else:
        lib.append(entry)

    _save_neglib(lib)
    return web.json_response({"status": "saved", "entry": entry})


@routes.delete("/arbo-tools/neglib/{entry_id}")
async def api_delete_neglib(request: web.Request) -> web.Response:
    entry_id = request.match_info["entry_id"]
    lib = _load_neglib()
    lib = [e for e in lib if e.get("id") != entry_id]
    _save_neglib(lib)
    return web.json_response({"status": "deleted"})
