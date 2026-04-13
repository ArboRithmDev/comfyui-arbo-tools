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

SEP = "\\"  # Category separator in display paths


# ── Data access ──────────────────────────────────────────────────────


def _ensure_data_dir():
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_prompts() -> dict[str, Any]:
    _ensure_data_dir()
    if _PROMPTS_FILE.exists():
        return json.loads(_PROMPTS_FILE.read_text(encoding="utf-8"))
    return {"prompts": []}


def _save_prompts(data: dict[str, Any]):
    _ensure_data_dir()
    _PROMPTS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _load_neglib() -> list[dict[str, Any]]:
    _ensure_data_dir()
    if _NEGLIB_FILE.exists():
        return json.loads(_NEGLIB_FILE.read_text(encoding="utf-8"))
    defaults = [
        {"id": "default_quality", "name": "Low quality", "text": "low quality, worst quality, blurry, jpeg artifacts, watermark, text, logo"},
        {"id": "default_anatomy", "name": "Bad anatomy", "text": "bad anatomy, bad hands, extra fingers, missing fingers, deformed, mutated, disfigured, extra limbs"},
        {"id": "default_composition", "name": "Bad composition", "text": "cropped, out of frame, cut off, poorly framed, bad composition, ugly"},
        {"id": "default_safety", "name": "Content safety", "text": "nsfw, nude, naked, explicit, suggestive"},
    ]
    _NEGLIB_FILE.write_text(json.dumps(defaults, indent=2, ensure_ascii=False), encoding="utf-8")
    return defaults


def _save_neglib(data: list[dict[str, Any]]):
    _ensure_data_dir()
    _NEGLIB_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Public helpers (used by nodes) ───────────────────────────────────


def list_categories() -> list[str]:
    """Return sorted list of all category paths."""
    data = _load_prompts()
    cats = set()
    for p in data.get("prompts", []):
        cat = p.get("category", "")
        if cat:
            parts = cat.replace("/", SEP).split(SEP)
            for i in range(1, len(parts) + 1):
                cats.add(SEP.join(parts[:i]))
    return sorted(cats)


def list_prompt_names() -> list[str]:
    """Return flat list of 'category\\name' paths for combo widgets."""
    data = _load_prompts()
    names = []
    for p in data.get("prompts", []):
        cat = p.get("category", "").replace("/", SEP)
        name = p.get("name", "")
        if cat:
            names.append(f"{cat}{SEP}{name}")
        else:
            names.append(name)
    return sorted(names)


def list_prompts_in_category(category: str = "") -> list[dict[str, str]]:
    """Return prompts filtered by category (and its children).

    Each entry has 'name' (display name only) and 'path' (full category\\name).
    """
    data = _load_prompts()
    results = []
    cat_prefix = category.replace("/", SEP).strip(SEP) if category else ""

    for p in data.get("prompts", []):
        pcat = p.get("category", "").replace("/", SEP)
        name = p.get("name", "")
        if name == "_category_placeholder":
            continue

        full_path = f"{pcat}{SEP}{name}" if pcat else name

        # Filter: show all if no category, or match prefix
        if not cat_prefix or pcat == cat_prefix or pcat.startswith(cat_prefix + SEP):
            results.append({
                "name": name,
                "path": full_path,
                "category": pcat,
            })

    return sorted(results, key=lambda r: r["path"])


def get_prompt_by_path(path: str) -> dict[str, Any] | None:
    """Find a prompt by its category\\name path."""
    data = _load_prompts()
    for p in data.get("prompts", []):
        cat = p.get("category", "").replace("/", SEP)
        name = p.get("name", "")
        full = f"{cat}{SEP}{name}" if cat else name
        if full == path:
            return p
    return None


def save_prompt(
    name: str,
    category: str,
    positive: str,
    negative: str,
    prompt_id: str | None = None,
    auto_replace: bool = True,
) -> dict[str, Any]:
    """Save or update a prompt pair."""
    data = _load_prompts()
    cat = category.replace("/", SEP).strip(SEP).strip()

    entry = {
        "id": prompt_id or str(uuid.uuid4())[:8],
        "name": name.strip(),
        "category": cat,
        "positive": positive,
        "negative": negative,
        "tags": [],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    existing_idx = None
    for i, p in enumerate(data["prompts"]):
        if p.get("name") == name.strip() and p.get("category", "").replace("/", SEP) == cat:
            existing_idx = i
            break

    if existing_idx is not None:
        if not auto_replace:
            return {"status": "exists", "prompt": data["prompts"][existing_idx]}
        entry["id"] = data["prompts"][existing_idx]["id"]
        entry["created_at"] = data["prompts"][existing_idx].get("created_at", entry["created_at"])
        data["prompts"][existing_idx] = entry
    else:
        data["prompts"].append(entry)

    _save_prompts(data)
    return {"status": "saved", "prompt": entry}


def list_neglib_names() -> list[str]:
    return [e.get("name", "") for e in _load_neglib()]


def get_neglib_text(name: str) -> str:
    for e in _load_neglib():
        if e.get("name") == name:
            return e.get("text", "")
    return ""


def save_neglib_entry(name: str, text: str, entry_id: str | None = None) -> dict[str, Any]:
    lib = _load_neglib()
    eid = entry_id or str(uuid.uuid4())[:8]

    existing_idx = None
    for i, e in enumerate(lib):
        if e.get("name") == name:
            existing_idx = i
            break

    entry = {"id": eid, "name": name.strip(), "text": text.strip()}
    if existing_idx is not None:
        entry["id"] = lib[existing_idx].get("id", eid)
        lib[existing_idx] = entry
    else:
        lib.append(entry)

    _save_neglib(lib)
    return entry


# ── REST endpoints ───────────────────────────────────────────────────


@routes.get("/arbo-tools/prompts")
async def api_list_prompts(_request: web.Request) -> web.Response:
    return web.json_response(_load_prompts())


@routes.get("/arbo-tools/prompts/names")
async def api_prompt_names(_request: web.Request) -> web.Response:
    return web.json_response(list_prompt_names())


@routes.get("/arbo-tools/prompts/filter")
async def api_filter_prompts(request: web.Request) -> web.Response:
    category = request.query.get("category", "")
    results = list_prompts_in_category(category)
    return web.json_response(results)


@routes.get("/arbo-tools/prompts/categories")
async def api_categories(_request: web.Request) -> web.Response:
    return web.json_response(list_categories())


@routes.get("/arbo-tools/prompts/load")
async def api_load_prompt(request: web.Request) -> web.Response:
    path = request.query.get("path", "")
    prompt = get_prompt_by_path(path)
    if prompt:
        return web.json_response(prompt)
    return web.json_response({"error": "not found"}, status=404)


@routes.post("/arbo-tools/prompts")
async def api_save_prompt(request: web.Request) -> web.Response:
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return web.json_response({"error": "name is required"}, status=400)
    result = save_prompt(
        name=name,
        category=body.get("category", ""),
        positive=body.get("positive", ""),
        negative=body.get("negative", ""),
        prompt_id=body.get("id"),
        auto_replace=body.get("auto_replace", True),
    )
    return web.json_response(result)


@routes.delete("/arbo-tools/prompts/{prompt_id}")
async def api_delete_prompt(request: web.Request) -> web.Response:
    prompt_id = request.match_info["prompt_id"]
    data = _load_prompts()
    data["prompts"] = [p for p in data["prompts"] if p.get("id") != prompt_id]
    _save_prompts(data)
    return web.json_response({"status": "deleted"})


@routes.get("/arbo-tools/neglib")
async def api_list_neglib(_request: web.Request) -> web.Response:
    return web.json_response(_load_neglib())


@routes.get("/arbo-tools/neglib/load")
async def api_load_neglib(request: web.Request) -> web.Response:
    name = request.query.get("name", "")
    for e in _load_neglib():
        if e.get("name") == name:
            return web.json_response(e)
    return web.json_response({"error": "not found"}, status=404)


@routes.post("/arbo-tools/neglib")
async def api_save_neglib(request: web.Request) -> web.Response:
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return web.json_response({"error": "name is required"}, status=400)
    entry = save_neglib_entry(name=name, text=body.get("text", ""), entry_id=body.get("id"))
    return web.json_response({"status": "saved", "entry": entry})


@routes.delete("/arbo-tools/neglib/{entry_id}")
async def api_delete_neglib(request: web.Request) -> web.Response:
    entry_id = request.match_info["entry_id"]
    lib = _load_neglib()
    lib = [e for e in lib if e.get("id") != entry_id]
    _save_neglib(lib)
    return web.json_response({"status": "deleted"})
