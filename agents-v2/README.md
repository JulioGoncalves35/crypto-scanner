# Agents v0.2 — Free Council

Python multi-agent stack using free LLM APIs (Gemini, Groq, OpenRouter).
Reads candidates from the Node scanner backend (must be running on :3001),
runs a LangGraph council, decides paper trades, writes decision audit log.

## Setup

    cd agents-v2
    python -m venv .venv
    .venv\Scripts\activate              # Windows
    pip install -r requirements.txt
    copy .env.example .env              # then fill keys

## Run

    python run_council.py --dry-run     # safe: no /open call
    python run_council.py               # live (still paper trade in backend)
    python run_risk_review.py           # one-shot review of active positions

## Test

    pytest -v
