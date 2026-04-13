"""Prompt storage — filesystem-based prompt library.

Categories = directories, prompts = individual JSON files.
Structure:
    ComfyUI/user/default/prompts/
    ├── Personnages/
    │   ├── _meta.json              (optional, for future use)
    │   ├── Fantasy/
    │   │   └── ShowOff Frontal.json
    │   └── EveryDayLife/
    │       └── PlayingBall.json
    └── _negative_library.json
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from aiohttp import web

try:
    from server import PromptServer
    routes = PromptServer.instance.routes
except Exception:
    routes = web.RouteTableDef()

_COMFYUI_ROOT = Path(__file__).parent.parent.parent.parent
_PROMPTS_DIR = _COMFYUI_ROOT / "user" / "default" / "prompts"
_NEGLIB_FILE = _PROMPTS_DIR / "_negative_library.json"

SEP = "\\"  # Category separator in display paths

# Legacy locations for migration
_LEGACY_DIR = Path(__file__).parent.parent / "data"
_LEGACY_PROMPTS_JSON = _COMFYUI_ROOT / "user" / "default" / "prompts" / "prompts.json"


# ── Init & migration ────────────────────────────────────────────────


def _ensure_dir():
    _PROMPTS_DIR.mkdir(parents=True, exist_ok=True)


_migrated = False


def _migrate():
    """Migrate from old formats (single JSON) to filesystem."""
    global _migrated
    if _migrated:
        return
    _migrated = True
    _ensure_dir()

    # Migrate from legacy data/ dir or single prompts.json
    for source in (_LEGACY_DIR / "prompts.json", _LEGACY_PROMPTS_JSON):
        if not source.exists():
            continue
        try:
            data = json.loads(source.read_text(encoding="utf-8"))
            for p in data.get("prompts", []):
                name = p.get("name", "")
                if not name or name == "_category_placeholder":
                    continue
                cat = p.get("category", "").replace("/", SEP)
                save_prompt(
                    name=name, category=cat,
                    positive=p.get("positive", ""),
                    negative=p.get("negative", ""),
                )
            source.unlink()
            print(f"[ArboTools] Migrated prompts from {source}")
        except Exception as e:
            print(f"[ArboTools] Migration error: {e}")

    # Migrate neglib
    for source in (_LEGACY_DIR / "negative_library.json",):
        if source.exists() and not _NEGLIB_FILE.exists():
            _NEGLIB_FILE.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
            source.unlink()

    # Migrate categories.json → create directories
    for source in (_LEGACY_DIR / "categories.json", _PROMPTS_DIR / "categories.json"):
        if source.exists():
            try:
                cats = json.loads(source.read_text(encoding="utf-8"))
                for cat in cats:
                    cat_dir = _PROMPTS_DIR / Path(cat.replace(SEP, "/"))
                    cat_dir.mkdir(parents=True, exist_ok=True)
                source.unlink()
            except Exception:
                pass


# ── Prompt file I/O ──────────────────────────────────────────────────


def _prompt_path(name: str, category: str) -> Path:
    """Get the filesystem path for a prompt."""
    cat = category.replace(SEP, "/").strip("/")
    if cat:
        return _PROMPTS_DIR / cat / f"{name}.json"
    return _PROMPTS_DIR / f"{name}.json"


def _read_prompt(path: Path) -> dict[str, Any] | None:
    """Read a prompt JSON file."""
    if not path.exists() or not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        # Inject name and category from path
        data["name"] = path.stem
        rel = path.relative_to(_PROMPTS_DIR)
        if rel.parent != Path("."):
            data["category"] = str(rel.parent).replace("/", SEP)
        else:
            data["category"] = ""
        return data
    except Exception:
        return None


def _write_prompt(path: Path, data: dict[str, Any]):
    """Write a prompt JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # Don't store name/category in the file — they come from the path
    to_save = {
        "positive": data.get("positive", ""),
        "negative": data.get("negative", ""),
        "tags": data.get("tags", []),
        "created_at": data.get("created_at", time.strftime("%Y-%m-%dT%H:%M:%S")),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    path.write_text(json.dumps(to_save, indent=2, ensure_ascii=False), encoding="utf-8")


def _scan_prompts() -> list[dict[str, Any]]:
    """Scan the filesystem for all prompt files."""
    _migrate()
    _ensure_dir()
    results = []
    for path in sorted(_PROMPTS_DIR.rglob("*.json")):
        if path.name.startswith("_"):
            continue
        prompt = _read_prompt(path)
        if prompt:
            results.append(prompt)
    return results


# ── Public helpers (used by nodes) ───────────────────────────────────


def list_categories() -> list[str]:
    """Return sorted list of all category paths (from directory structure)."""
    _migrate()
    _ensure_dir()
    cats = set()
    for d in _PROMPTS_DIR.rglob("*"):
        if d.is_dir() and not d.name.startswith("_"):
            rel = str(d.relative_to(_PROMPTS_DIR)).replace("/", SEP)
            # Add all parent levels
            parts = rel.split(SEP)
            for i in range(1, len(parts) + 1):
                cats.add(SEP.join(parts[:i]))
    return sorted(cats)


def add_category(path: str) -> str:
    """Create a category directory (and all parents). Returns normalized path."""
    _ensure_dir()
    normalized = path.replace("/", SEP).strip(SEP).strip()
    if not normalized:
        return ""
    cat_dir = _PROMPTS_DIR / normalized.replace(SEP, "/")
    cat_dir.mkdir(parents=True, exist_ok=True)
    return normalized


def list_prompt_names() -> list[str]:
    """Return flat list of 'category\\name' paths for combo widgets."""
    return [
        f"{p['category']}{SEP}{p['name']}" if p["category"] else p["name"]
        for p in _scan_prompts()
    ]


def list_prompts_in_category(category: str = "") -> list[dict[str, str]]:
    """Return prompts filtered by category (and children).

    Each entry has 'display', 'name', 'path', 'category'.
    """
    all_prompts = _scan_prompts()
    cat_prefix = category.replace("/", SEP).strip(SEP) if category else ""

    raw = []
    for p in all_prompts:
        pcat = p["category"]
        name = p["name"]
        full_path = f"{pcat}{SEP}{name}" if pcat else name

        if not cat_prefix or pcat == cat_prefix or pcat.startswith(cat_prefix + SEP):
            raw.append({"name": name, "path": full_path, "category": pcat})

    # Detect duplicate names → prefix with parent
    name_count: dict[str, int] = {}
    for r in raw:
        name_count[r["name"]] = name_count.get(r["name"], 0) + 1

    results = []
    for r in raw:
        if name_count[r["name"]] > 1 and r["category"]:
            parent = r["category"].split(SEP)[-1]
            display = f"{parent}{SEP}{r['name']}"
        else:
            display = r["name"]
        results.append({**r, "display": display})

    return sorted(results, key=lambda r: r["path"])


def get_prompt_by_path(path: str) -> dict[str, Any] | None:
    """Find a prompt by its category\\name path."""
    parts = path.replace("/", SEP).split(SEP)
    name = parts[-1]
    category = SEP.join(parts[:-1]) if len(parts) > 1 else ""
    return _read_prompt(_prompt_path(name, category))


def save_prompt(
    name: str,
    category: str,
    positive: str,
    negative: str,
    **kwargs,
) -> dict[str, Any]:
    """Save a prompt file."""
    cat = category.replace("/", SEP).strip(SEP).strip()
    path = _prompt_path(name.strip(), cat)

    # Preserve created_at if updating
    existing = _read_prompt(path)
    data = {
        "positive": positive,
        "negative": negative,
        "tags": kwargs.get("tags", []),
        "created_at": existing.get("created_at") if existing else time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    _write_prompt(path, data)
    return {"status": "saved", "name": name, "category": cat}


# ── Negative library ─────────────────────────────────────────────────


def _load_neglib() -> list[dict[str, Any]]:
    _ensure_dir()
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
    _ensure_dir()
    _NEGLIB_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def list_neglib_names() -> list[str]:
    return [e.get("name", "") for e in _load_neglib()]


def get_neglib_text(name: str) -> str:
    for e in _load_neglib():
        if e.get("name") == name:
            return e.get("text", "")
    return ""


def save_neglib_entry(name: str, text: str, entry_id: str | None = None) -> dict[str, Any]:
    import uuid
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
    return web.json_response({"prompts": _scan_prompts()})


@routes.get("/arbo-tools/prompts/names")
async def api_prompt_names(_request: web.Request) -> web.Response:
    return web.json_response(list_prompt_names())


@routes.get("/arbo-tools/prompts/filter")
async def api_filter_prompts(request: web.Request) -> web.Response:
    category = request.query.get("category", "")
    return web.json_response(list_prompts_in_category(category))


@routes.get("/arbo-tools/prompts/categories")
async def api_categories(_request: web.Request) -> web.Response:
    return web.json_response(list_categories())


@routes.post("/arbo-tools/prompts/categories")
async def api_add_category(request: web.Request) -> web.Response:
    body = await request.json()
    path = body.get("path", "").strip()
    if not path:
        return web.json_response({"error": "path is required"}, status=400)
    normalized = add_category(path)
    return web.json_response({"status": "created", "path": normalized})


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
    )
    return web.json_response(result)


@routes.delete("/arbo-tools/prompts/{prompt_path:.*}")
async def api_delete_prompt(request: web.Request) -> web.Response:
    prompt_path = request.match_info["prompt_path"]
    prompt = get_prompt_by_path(prompt_path)
    if not prompt:
        return web.json_response({"error": "not found"}, status=404)
    path = _prompt_path(prompt["name"], prompt["category"])
    if path.exists():
        path.unlink()
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
