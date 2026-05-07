"""Unified LLM client with provider routing + fallback.

Provider IDs:
  gemini-flash   → Google AI Studio, Gemini 2.5 Flash (1500 RPD)
  gemini-pro     → Google AI Studio, Gemini 2.5 Pro (~50 RPD, reserve)
  groq-llama70b  → Groq, Llama 3.3 70B (1000 RPD, 30 RPM)
  openrouter-deepseek → OpenRouter, deepseek/deepseek-r1:free
"""
from __future__ import annotations
import json
import logging
from typing import Callable, Any

from src import config

log = logging.getLogger(__name__)

ROUTES: dict[str, dict[str, str]] = {
    "technical":     {"primary": "gemini-flash",        "fallback": "groq-llama70b"},
    "sentiment":     {"primary": "gemini-flash",        "fallback": "groq-llama70b"},
    "news":          {"primary": "gemini-flash",        "fallback": "openrouter-deepseek"},
    "bull":          {"primary": "groq-llama70b",       "fallback": "gemini-flash"},
    "bear":          {"primary": "groq-llama70b",       "fallback": "gemini-flash"},
    "trader":        {"primary": "gemini-pro",          "fallback": "gemini-flash"},
    "risk_reviewer": {"primary": "openrouter-deepseek", "fallback": "gemini-flash"},
}

# ─── Provider implementations ────────────────────────────────────────────────

def _call_gemini(model: str, system: str, user: str, as_json: bool) -> str:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=config.GEMINI_API_KEY)
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json" if as_json else "text/plain",
        temperature=0.3,
    )
    resp = client.models.generate_content(
        model=model, contents=user, config=cfg,
    )
    return resp.text

def _call_groq(model: str, system: str, user: str, as_json: bool) -> str:
    from groq import Groq
    client = Groq(api_key=config.GROQ_API_KEY)
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    if as_json:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content

def _call_openrouter(model: str, system: str, user: str, as_json: bool) -> str:
    from openai import OpenAI
    client = OpenAI(
        api_key=config.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    if as_json:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content

def _gemini_flash(s, u, j): return _call_gemini("gemini-2.5-flash", s, u, j)
def _gemini_pro(s, u, j):   return _call_gemini("gemini-2.5-pro",   s, u, j)
def _groq_llama70b(s, u, j): return _call_groq("llama-3.3-70b-versatile", s, u, j)
def _openrouter_deepseek(s, u, j):
    return _call_openrouter("deepseek/deepseek-r1:free", s, u, j)

_PROVIDER_FNS: dict[str, Callable[[str, str, bool], str]] = {
    "gemini-flash":         _gemini_flash,
    "gemini-pro":           _gemini_pro,
    "groq-llama70b":        _groq_llama70b,
    "openrouter-deepseek":  _openrouter_deepseek,
}

# ─── Public API ──────────────────────────────────────────────────────────────

def call_llm(agent: str, *, system: str, user: str, as_json: bool = False):
    if agent not in ROUTES:
        raise KeyError(f"no route configured for agent {agent}")
    route = ROUTES[agent]
    for tier in ("primary", "fallback"):
        provider = route[tier]
        fn = _PROVIDER_FNS[provider]
        try:
            log.info("[llm] %s → %s (%s)", agent, provider, tier)
            raw = fn(system, user, as_json)
            return json.loads(raw) if as_json else raw
        except Exception as e:
            log.warning("[llm] %s on %s failed: %s", agent, provider, e)
            if tier == "fallback":
                raise
    raise RuntimeError("unreachable")
