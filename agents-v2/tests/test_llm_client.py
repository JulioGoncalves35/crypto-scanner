from unittest.mock import patch, MagicMock

from src.llm_client import call_llm, ROUTES

def test_routes_cover_all_agents():
    expected = {"technical", "sentiment", "news", "bull", "bear", "trader", "risk_reviewer"}
    assert expected.issubset(ROUTES.keys())

def test_routes_have_fallback():
    for name, route in ROUTES.items():
        assert "primary" in route and "fallback" in route, f"{name} missing fallback"

def test_call_llm_uses_fallback_on_primary_error():
    fake_primary = MagicMock(side_effect=RuntimeError("rate limit"))
    fake_fallback = MagicMock(return_value='{"ok": true}')
    with patch("src.llm_client._PROVIDER_FNS", {
        "gemini-flash": fake_primary,
        "groq-llama70b": fake_fallback,
    }):
        with patch.dict(ROUTES, {
            "test_agent": {"primary": "gemini-flash", "fallback": "groq-llama70b"}
        }, clear=False):
            out = call_llm("test_agent", system="s", user="u", as_json=True)
    assert out == {"ok": True}
    fake_primary.assert_called_once()
    fake_fallback.assert_called_once()

def test_call_llm_returns_dict_when_as_json():
    fake = MagicMock(return_value='{"a": 1}')
    with patch("src.llm_client._PROVIDER_FNS", {"gemini-flash": fake}):
        with patch.dict(ROUTES, {
            "test_agent": {"primary": "gemini-flash", "fallback": "gemini-flash"}
        }, clear=False):
            out = call_llm("test_agent", system="s", user="u", as_json=True)
    assert out == {"a": 1}
