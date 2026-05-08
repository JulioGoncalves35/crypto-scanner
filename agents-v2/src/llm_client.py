"""Unified LLM client with provider routing + fallback.

Provider IDs (FREE TIER quotas observed 2026-05-08):
  cerebras-qwen235b   → Cerebras Cloud, Qwen3 235B Instruct (FREE — primary technical/sentiment, top reasoning)
  groq-llama70b       → Groq, Llama 3.3 70B (FREE: 1000 RPD, 100k TPD — primary bull/bear)
  mistral-large       → Mistral La Plateforme, mistral-large-latest (FREE tier — primary trader)
  gemini-flash        → Google AI Studio, Gemini 2.5 Flash (FREE: 20 RPD — primary news only)
  gemini-pro          → Google AI Studio, Gemini 2.5 Pro (FREE: 0 RPD — UNUSABLE on free key)
  openrouter-deepseek → OpenRouter, qwen/qwen3-next-80b-a3b-instruct:free (rate-limited fallback)
"""
from __future__ import annotations
import json
import logging
import re
import time
from typing import Callable, Any

from src import config

log = logging.getLogger(__name__)

ROUTES: dict[str, dict[str, str]] = {
    "technical":     {"primary": "cerebras-qwen235b",   "fallback": "groq-llama70b"},
    "sentiment":     {"primary": "cerebras-qwen235b",   "fallback": "groq-llama70b"},
    "news":          {"primary": "gemini-flash",        "fallback": "openrouter-deepseek"},
    "bull":          {"primary": "groq-llama70b",       "fallback": "cerebras-qwen235b"},
    "bear":          {"primary": "groq-llama70b",       "fallback": "cerebras-qwen235b"},
    "trader":        {"primary": "mistral-large",       "fallback": "groq-llama70b"},
    "risk_reviewer": {"primary": "openrouter-deepseek", "fallback": "cerebras-qwen235b"},
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

def _call_cerebras(model: str, system: str, user: str, as_json: bool) -> str:
    from openai import OpenAI
    client = OpenAI(
        api_key=config.CEREBRAS_API_KEY,
        base_url="https://api.cerebras.ai/v1",
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

def _call_mistral(model: str, system: str, user: str, as_json: bool) -> str:
    # mistralai 2.x: Mistral lives in mistralai.client.sdk (not top-level).
    from mistralai.client.sdk import Mistral
    client = Mistral(api_key=config.MISTRAL_API_KEY)
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
    resp = client.chat.complete(**kwargs)
    return resp.choices[0].message.content

def _gemini_flash(s, u, j): return _call_gemini("gemini-2.5-flash", s, u, j)
def _gemini_pro(s, u, j):   return _call_gemini("gemini-2.5-pro",   s, u, j)
def _groq_llama70b(s, u, j): return _call_groq("llama-3.3-70b-versatile", s, u, j)
def _cerebras_qwen235b(s, u, j): return _call_cerebras("qwen-3-235b-a22b-instruct-2507", s, u, j)
def _mistral_large(s, u, j): return _call_mistral("mistral-large-latest", s, u, j)
def _openrouter_deepseek(s, u, j):
    # Note: deepseek/deepseek-r1:free was deprecated 2026-05.
    # Using Qwen3-Next 80B (free) — kept the function name for routing-table compat.
    return _call_openrouter("qwen/qwen3-next-80b-a3b-instruct:free", s, u, j)

_PROVIDER_FNS: dict[str, Callable[[str, str, bool], str]] = {
    "gemini-flash":         _gemini_flash,
    "gemini-pro":           _gemini_pro,
    "groq-llama70b":        _groq_llama70b,
    "cerebras-qwen235b":    _cerebras_qwen235b,
    "mistral-large":        _mistral_large,
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
        for attempt in (1, 2):
            try:
                log.info("[llm] %s → %s (%s, attempt=%d)", agent, provider, tier, attempt)
                raw = fn(system, user, as_json)
                return json.loads(raw) if as_json else raw
            except Exception as e:
                msg = str(e)
                is_429 = "429" in msg or "RESOURCE_EXHAUSTED" in msg or "rate limit" in msg.lower()
                if is_429 and attempt == 1:
                    m = re.search(r"retry in ([0-9.]+)s", msg)
                    wait = min(float(m.group(1)) + 1, 65) if m else 12
                    log.warning("[llm] %s on %s 429 — sleeping %.1fs then retry", agent, provider, wait)
                    time.sleep(wait)
                    continue
                log.warning("[llm] %s on %s failed: %s", agent, provider, e)
                if tier == "fallback":
                    raise
                break
    raise RuntimeError("unreachable")
