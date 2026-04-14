"""Prompt enhancement — LLM-based prompt rewriting."""

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

_DATA_DIR = Path(__file__).parent.parent.parent.parent / "user" / "default" / "prompts"
_CONFIG_FILE = _DATA_DIR / "_studio_config.json"

ENHANCE_SYSTEM = {
    "light": "Slightly improve this prompt: fix grammar, clarify meaning, keep it close to the original. ",
    "medium": "Enhance this prompt: add relevant details about composition, lighting, colors, textures, mood. Enrich without changing the core intent. ",
    "heavy": "Creatively rewrite this prompt: reimagine with vivid details, artistic direction, dramatic composition. Transform it into something visually striking. ",
}


def _load_config() -> dict[str, Any]:
    if _CONFIG_FILE.exists():
        return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
    return {}


def _save_config(data: dict[str, Any]):
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _CONFIG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


async def _call_ollama(prompt: str, system: str, config: dict) -> str:
    """Call Ollama API."""
    import aiohttp
    url = config.get("ollama_url", "http://localhost:11434")
    model = config.get("model", "")
    if not model:
        return ""

    async with aiohttp.ClientSession() as session:
        async with session.post(f"{url}/api/generate", json={
            "model": model,
            "prompt": prompt,
            "system": system,
            "stream": False,
        }, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            data = await resp.json()
            return data.get("response", "").strip()


async def _call_openai(prompt: str, system: str, config: dict) -> str:
    """Call OpenAI-compatible API."""
    import aiohttp
    api_key = config.get("api_key", "")
    model = config.get("model", "gpt-4o-mini")

    async with aiohttp.ClientSession() as session:
        async with session.post("https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ], "max_tokens": 2000},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as resp:
            data = await resp.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()


async def _call_anthropic(prompt: str, system: str, config: dict) -> str:
    """Call Anthropic API."""
    import aiohttp
    api_key = config.get("api_key", "")
    model = config.get("model", "claude-sonnet-4-20250514")

    async with aiohttp.ClientSession() as session:
        async with session.post("https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "Content-Type": "application/json", "anthropic-version": "2023-06-01"},
            json={"model": model, "max_tokens": 2000, "system": system,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as resp:
            data = await resp.json()
            content = data.get("content", [])
            return content[0].get("text", "").strip() if content else ""


async def enhance_prompt(positive: str, negative: str, level: str, config: dict) -> dict[str, str]:
    """Enhance a prompt using the configured LLM."""
    provider = config.get("provider", "ollama")
    system_override = config.get("system_prompt_override", "")

    # Build system prompt
    base_system = system_override or config.get("_resolved_system", "")
    level_prefix = ENHANCE_SYSTEM.get(level, ENHANCE_SYSTEM["medium"])
    system = level_prefix + base_system

    user_prompt = f"Positive prompt:\n{positive}"
    if negative:
        user_prompt += f"\n\nNegative prompt:\n{negative}"
    user_prompt += "\n\nImprove this prompt. Output ONLY the improved positive prompt (and negative if provided), clearly separated."

    try:
        if provider == "ollama":
            response = await _call_ollama(user_prompt, system, config)
        elif provider == "openai":
            response = await _call_openai(user_prompt, system, config)
        elif provider == "anthropic":
            response = await _call_anthropic(user_prompt, system, config)
        else:
            return {"error": f"Unknown provider: {provider}"}

        if not response:
            return {"error": "Empty response from LLM"}

        # Parse response — try to split positive/negative
        parts = response.split("Negative prompt:", 1) if "Negative prompt:" in response else \
                response.split("Negative:", 1) if "Negative:" in response else [response]

        result = {"positive": parts[0].replace("Positive prompt:", "").replace("Positive:", "").strip()}
        if len(parts) > 1:
            result["negative"] = parts[1].strip()

        return result

    except Exception as e:
        return {"error": str(e)}


def _scan_llm_models() -> list[dict[str, str]]:
    """Scan local LLM models directory."""
    models_dir = Path(__file__).parent.parent.parent.parent / "models" / "LLM"
    results = []
    if models_dir.exists():
        for f in sorted(models_dir.rglob("*.gguf")):
            results.append({"name": f.stem, "id": str(f.relative_to(models_dir)), "type": "gguf"})
    return results


async def _list_ollama_models(config: dict) -> list[dict[str, str]]:
    """List models from Ollama API."""
    import aiohttp
    url = config.get("ollama_url", "http://localhost:11434")
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
            async with session.get(f"{url}/api/tags") as resp:
                data = await resp.json()
                return [{"name": m.get("name", ""), "id": m.get("name", ""), "type": "ollama"} for m in data.get("models", [])]
    except Exception:
        return []


# ── REST endpoints ───────────────────────────────────────────────────


@routes.get("/arbo-tools/studio/config")
async def api_get_config(_request: web.Request) -> web.Response:
    return web.json_response(_load_config())


@routes.post("/arbo-tools/studio/config")
async def api_save_config(request: web.Request) -> web.Response:
    body = await request.json()
    _save_config(body)
    return web.json_response({"status": "saved"})


@routes.get("/arbo-tools/studio/models")
async def api_list_models(request: web.Request) -> web.Response:
    config = _load_config()
    # Allow provider override from query param (UI may not have saved yet)
    provider = request.query.get("provider", config.get("provider", "ollama"))
    models = []
    if provider == "ollama":
        models = await _list_ollama_models(config)
    elif provider == "local_gguf":
        models = _scan_llm_models()
    elif provider == "openai":
        models = [
            {"name": "GPT-4o Mini", "id": "gpt-4o-mini", "type": "cloud"},
            {"name": "GPT-4o", "id": "gpt-4o", "type": "cloud"},
            {"name": "GPT-4 Turbo", "id": "gpt-4-turbo", "type": "cloud"},
        ]
    elif provider == "anthropic":
        models = [
            {"name": "Claude Sonnet 4", "id": "claude-sonnet-4-20250514", "type": "cloud"},
            {"name": "Claude Haiku 3.5", "id": "claude-haiku-4-5-20251001", "type": "cloud"},
        ]
    return web.json_response({"models": models})


@routes.post("/arbo-tools/studio/enhance")
async def api_enhance(request: web.Request) -> web.Response:
    body = await request.json()
    positive = body.get("positive", "")
    negative = body.get("negative", "")
    level = body.get("level", "medium")
    config = body.get("config", _load_config())

    if not positive:
        return web.json_response({"error": "No positive prompt to enhance"})

    result = await enhance_prompt(positive, negative, level, config)
    return web.json_response(result)
