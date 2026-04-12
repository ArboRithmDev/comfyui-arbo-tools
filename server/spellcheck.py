"""Spellcheck REST endpoint for ComfyUI."""

from __future__ import annotations

import re

from aiohttp import web
from spellchecker import SpellChecker

try:
    from server import PromptServer
    routes = PromptServer.instance.routes
except Exception:
    routes = web.RouteTableDef()

# Lazy-loaded spell checkers per language
_checkers: dict[str, SpellChecker] = {}


def _get_checker(lang: str = "fr") -> SpellChecker:
    if lang not in _checkers:
        _checkers[lang] = SpellChecker(language=lang)
    return _checkers[lang]


def _split_words(text: str) -> list[tuple[str, int]]:
    """Split text into (word, offset) pairs, skipping short words and numbers."""
    return [
        (m.group(), m.start())
        for m in re.finditer(r"[a-zA-ZÀ-ÿ]{2,}", text)
    ]


@routes.post("/arbo-tools/spellcheck")
async def spellcheck_endpoint(request: web.Request) -> web.Response:
    body = await request.json()
    text = body.get("text", "")
    lang = body.get("lang", "fr")

    if not text:
        return web.json_response({"errors": []})

    checker = _get_checker(lang)

    words = _split_words(text)
    word_set = {w.lower() for w, _ in words}
    unknown = checker.unknown(word_set)

    errors = []
    for word, offset in words:
        if word.lower() in unknown:
            candidates = checker.candidates(word.lower())
            if candidates:
                suggestions = sorted(candidates, key=lambda c: checker.word_usage_frequency(c), reverse=True)[:5]
            else:
                suggestions = []
            errors.append({
                "word": word,
                "offset": offset,
                "length": len(word),
                "suggestions": suggestions,
            })

    return web.json_response({"errors": errors})
