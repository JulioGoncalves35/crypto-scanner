"""LangGraph orchestration for the council."""
import operator
from typing import TypedDict, Optional, Annotated
from langgraph.graph import StateGraph, END

from src.schemas import Candidate
from src.agents.technical import run as run_technical
from src.agents.sentiment import run as run_sentiment
from src.agents.news import run as run_news
from src.agents.bull import run as run_bull
from src.agents.bear import run as run_bear
from src.agents.trader import run as run_trader
from src.agents.validator import run as run_validator


class State(TypedDict, total=False):
    candidate: dict
    scan_batch_regime_scores: list[int]
    history: list[dict]
    validator: Optional[dict]
    technical: Optional[dict]
    sentiment: Optional[dict]
    news: Optional[dict]
    bull: Optional[dict]
    bear: Optional[dict]
    trader: Optional[dict]
    errors: Annotated[list[str], operator.add]


def _join_analysts(state: State) -> State:
    """No-op join node — exists so we can fan-in cleanly before bull/bear."""
    return {}


def _early_exit(state: State) -> State:
    """Emitted when validator REJECTs — synthesise SKIP trader output."""
    v = state.get("validator") or {}
    return {"trader": {
        "decision": "SKIP",
        "reason": f"validator REJECT: {v.get('key_concern', 'n/a')}",
        "size_multiplier": 1.0,
        "payload": None,
    }}


def _route_after_validator(state: State) -> str:
    v = state.get("validator") or {}
    return "early_exit" if v.get("verdict") == "REJECT" else "analyst_technical"


def build_graph():
    g = StateGraph(State)
    g.add_node("gate_validator", run_validator)
    g.add_node("early_exit", _early_exit)
    g.add_node("analyst_technical", run_technical)
    g.add_node("analyst_sentiment", run_sentiment)
    g.add_node("analyst_news", run_news)
    g.add_node("join_analysts", _join_analysts)
    g.add_node("researcher_bull", run_bull)
    g.add_node("researcher_bear", run_bear)
    g.add_node("join_research", _join_analysts)
    g.add_node("decision_trader", run_trader)

    g.set_entry_point("gate_validator")
    g.add_conditional_edges("gate_validator", _route_after_validator, {
        "early_exit": "early_exit",
        "analyst_technical": "analyst_technical",
    })
    g.add_edge("early_exit", END)

    # On VALIDATE/DOWNGRADE: serial chain of analysts, then fan-out bull/bear.
    g.add_edge("analyst_technical", "analyst_sentiment")
    g.add_edge("analyst_sentiment", "analyst_news")
    g.add_edge("analyst_news", "join_analysts")
    g.add_edge("join_analysts", "researcher_bull")
    g.add_edge("join_analysts", "researcher_bear")
    g.add_edge("researcher_bull", "join_research")
    g.add_edge("researcher_bear", "join_research")
    g.add_edge("join_research", "decision_trader")
    g.add_edge("decision_trader", END)

    return g.compile()


_GRAPH = None
def _get():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH


def run_council(candidate: Candidate, *, batch_regime_scores: list[int] | None = None,
                history: list[dict] | None = None) -> dict:
    initial: State = {
        "candidate": candidate.model_dump(),
        "scan_batch_regime_scores": batch_regime_scores or [],
        "history": history or [],
        "errors": [],
    }
    return _get().invoke(initial)
