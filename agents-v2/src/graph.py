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

class State(TypedDict, total=False):
    candidate: dict
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

def build_graph():
    g = StateGraph(State)
    g.add_node("analyst_technical", run_technical)
    g.add_node("analyst_sentiment", run_sentiment)
    g.add_node("analyst_news", run_news)
    g.add_node("join_analysts", _join_analysts)
    g.add_node("researcher_bull", run_bull)
    g.add_node("researcher_bear", run_bear)
    g.add_node("decision_trader", run_trader)

    # Fan-out from start to the 3 analysts
    g.set_entry_point("analyst_technical")
    g.add_edge("analyst_technical", "join_analysts")
    g.add_edge("analyst_sentiment", "join_analysts")
    g.add_edge("analyst_news", "join_analysts")
    # Also start sentiment + news (LangGraph parallel)
    g.add_edge("__start__", "analyst_sentiment")
    g.add_edge("__start__", "analyst_news")

    # Bull + bear after analysts join
    g.add_edge("join_analysts", "researcher_bull")
    g.add_edge("join_analysts", "researcher_bear")

    # Trader joins bull + bear
    g.add_node("join_research", _join_analysts)
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

def run_council(candidate: Candidate) -> dict:
    initial: State = {"candidate": candidate.model_dump(), "errors": []}
    return _get().invoke(initial)
