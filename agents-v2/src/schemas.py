"""Pydantic models — strict typing across the council pipeline."""
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

Direction = Literal["buy", "sell"]
Timeframe = Literal["5m", "15m", "30m", "1h", "4h", "1D"]
Bias = Literal["bull", "bear", "neutral"]


class Candidate(BaseModel):
    coin: str
    direction: Direction
    timeframe: Timeframe
    regime_score: int   # signed, uncapped
    entry_score: int    # signed, uncapped
    entry: float
    stop: float
    m1: float
    m2: float
    m3: float
    stop_pct: float
    leverage: int = Field(ge=1, le=125)
    signals: list[str] = Field(default_factory=list)
    scan_id: Optional[int] = None
    momentum_ctx: Optional[dict] = None   # from momentumCtx in analyzeCandles

    @field_validator("coin", mode="before")
    @classmethod
    def strip_usdt(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        s = v.upper()
        return s[:-4] if s.endswith("USDT") else s


class TechnicalOutput(BaseModel):
    regime: Literal["trending_up", "trending_down", "ranging", "volatile", "unclear"]
    confluences: list[str]
    red_flags: list[str]
    confidence_0_100: int = Field(ge=0, le=100)
    tf_alignment: Literal["aligned", "mixed", "conflicting", "unclear"]


class SentimentOutput(BaseModel):
    crowd_bias: Bias
    funding_signal: Literal["overheated_long", "overheated_short", "neutral", "unknown"]
    sentiment_score: int = Field(ge=-100, le=100)
    contrarian_alert: bool
    notes: str = ""


class NewsItem(BaseModel):
    headline: str
    confidence: Literal["VERIFIED", "MEDIUM", "UNVERIFIED"]
    source_count: int = Field(ge=0)


class NewsOutput(BaseModel):
    news_bias: Bias
    catalyst_window_hours: Optional[int] = None
    hard_block: bool
    block_reason: str = ""
    items: list[NewsItem] = Field(default_factory=list)


class ValidatorOutput(BaseModel):
    verdict: Literal["VALIDATE", "DOWNGRADE", "REJECT"]
    confidence: int = Field(ge=0, le=100)
    key_concern: str
    tf_coherent: bool
    signals_verified: bool
    chronic_candidate: bool = False
    saturation_percentile: float = Field(ge=0.0, le=1.0, default=0.0)
    market_phase:   Literal["trending", "choppy", "reversing"] = "choppy"
    timing_quality: Literal["good", "neutral", "poor"] = "neutral"


class ResearcherOutput(BaseModel):
    side: Literal["bull", "bear"]
    thesis: str
    evidence: list[str] = Field(min_length=1, max_length=5)
    counter_to_other_side: str
    expected_rr: float


class OpenPayload(BaseModel):
    """Mirrors POST /api/trades/open body; no USDT suffix in coin."""
    coin: str
    direction: Direction
    timeframe: Timeframe
    regime_score: int
    entry_score: int
    entry: float
    stop: float
    m1: float
    m2: float
    m3: float
    stop_pct: float
    leverage: int
    type: Literal["scalp", "day", "swing"] = "day"
    signals: list[str] = Field(default_factory=list)

    @field_validator("coin", mode="before")
    @classmethod
    def no_usdt(cls, v: str) -> str:
        s = v.upper()
        return s[:-4] if s.endswith("USDT") else s


class TraderOutput(BaseModel):
    decision: Literal["OPEN", "SKIP", "OPEN_REDUCED"]
    reason: str
    size_multiplier: float = 1.0
    payload: Optional[OpenPayload] = None

    @model_validator(mode="after")
    def open_needs_payload(self):
        if self.decision in ("OPEN", "OPEN_REDUCED") and self.payload is None:
            raise ValueError("OPEN/OPEN_REDUCED requires payload")
        return self


class RiskReviewerOutput(BaseModel):
    trade_id: str
    action: Literal["HOLD", "EXIT", "TIGHTEN_STOP"]
    new_stop: Optional[float] = None
    reason: str


class CouncilState(BaseModel):
    """Shared state object flowing through the LangGraph."""
    candidate: Candidate
    validator: Optional[ValidatorOutput] = None
    technical: Optional[TechnicalOutput] = None
    sentiment: Optional[SentimentOutput] = None
    news: Optional[NewsOutput] = None
    bull: Optional[ResearcherOutput] = None
    bear: Optional[ResearcherOutput] = None
    trader: Optional[TraderOutput] = None
    errors: list[str] = Field(default_factory=list)
