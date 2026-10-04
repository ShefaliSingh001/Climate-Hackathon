"""Plain-language monthly sustainability report, written by Claude from the impact numbers.

Claude only sees the numbers from `impact.summarise()` and is told to use nothing
else, so every figure in the report can be traced to the dashboard. Without an
API key, or if the call fails, a template report built from the same numbers is
returned instead, so the dashboard always has something to show.
"""

import json
import logging
import math
import os
from pathlib import Path

import anthropic

try:  # local development reads backend/.env; on Vercel the key is a project environment variable
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

log = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """You write the monthly sustainability report for ResourceX, a marketplace in New South Wales, \
Australia, that matches businesses selling recycled metal scrap with manufacturers who need it.

Readers are owners and managers of small manufacturers and scrap producers, plus judges of a climate hackathon. \
They are not climate experts.

Rules:
- Use only the numbers in the data you are given. Do not invent, estimate or look up any other figures.
- Round numbers sensibly and write them the Australian way (e.g. "15,900 tonnes", "A$810,000").
- Explain what CO2e means the first time you use it, in a few words.
- Use the metal figures in "outlook": they are specific to this dataset's metals. The global all-materials rate \
and the COP31 15% goal cover every material in the economy; mention them at most once, as context.
- Say plainly that the figures are a projection from a demonstration dataset, not recorded trades.
- Lead with the 2035 comparison from "outlook": the share of recycled and of virgin (newly mined) metal that manufacturers on ResourceX buy in 2035 with the marketplace (expected scenario) versus without it, and the range across scenarios. Then this month's marketplace results.
- Describe the 2035 outlook in the data ("outlook"): the recycled share of metal input for manufacturers on ResourceX, with and without the marketplace, in the expected scenario, and the range across scenarios. Say plainly that the 15% goal covers all materials across the whole economy and that metals are already above it, so the outlook shows how far manufacturers can go, not a change in the global rate.
- Point out the single most useful insight in the data (for example, which material drives most of the climate \
benefit, or where demand outstrips supply) and what it means for the readers.
- Plain, warm, factual tone. Australian spelling. No markdown, no emoji."""

REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "One sentence, under 20 words, with the month's main result."},
        "summary": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Two or three short paragraphs.",
        },
        "highlights": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Three one-sentence takeaways, each with a number.",
        },
    },
    "required": ["headline", "summary", "highlights"],
    "additionalProperties": False,
}


def _prompt_data(impact: dict) -> dict:
    """The subset of the impact response Claude needs; factor URLs and long notes are left out."""
    keep = ["period", "isSample", "tonnesRecirculated", "co2eAvoidedT", "transportCo2eT", "landfillAvoidedT",
            "moneySavedAud", "valueRecoveredAud", "tonnesOffered", "tonnesRequested", "trades", "producers",
            "tenders", "byMaterial", "circularity"]
    data = {k: impact[k] for k in keep}
    data["emissionFactors"] = {f["material"]: f["tco2ePerT"] for f in impact["factors"]}
    o = impact["outlook"]
    data["outlook"] = {
        "metric": o["metric"],
        "businessAsUsualPct": {"2026": o["businessAsUsualPct"][0], "2035": o["businessAsUsualPct"][-1]},
        "withResourceXPct": {s["label"]: {"growthPerYearPct": s["growthPct"], "2026": s["sharePct"][0],
                                          "2035": s["sharePct"][-1], "co2eAvoided2026to2035T": s["co2eAvoidedT"]}
                             for s in o["scenarios"]},
        "ceilingPct": o["ceilingPct"],
        "assumptions": o["assumptions"],
    }
    return data


def _n(x: float) -> str:
    """Whole number with thousands separators, rounded half up like the dashboard (JavaScript Math.round)."""
    return f"{math.floor(x + 0.5):,}"


def template_report(impact: dict, note: str) -> dict:
    """A report built without an LLM, from the same numbers."""
    top = impact["byMaterial"][0]
    share = top["co2eAvoidedT"] / impact["co2eAvoidedT"] if impact["co2eAvoidedT"] else 0
    tonnes_share = top["tonnes"] / impact["tonnesRecirculated"] if impact["tonnesRecirculated"] else 0
    tenders = impact["tenders"]
    o = impact["outlook"]
    bau, exp = o["businessAsUsualPct"], next(s for s in o["scenarios"] if s["key"] == "expected")
    low, high = min(x["sharePct"][-1] for x in o["scenarios"]), max(x["sharePct"][-1] for x in o["scenarios"])
    return {
        "headline": f"By 2035, manufacturers on ResourceX could buy {exp['sharePct'][-1]:.0f}% recycled metal, "
                    f"up from {bau[-1]:.0f}% without it.",
        "summary": [
            f"About {bau[0]:.0f}% of the metal these {tenders['total']} NSW manufacturers buy is recycled today. Industry "
            f"trends alone take that to {bau[-1]:.1f}% by 2035, so {100 - bau[-1]:.0f}% would still be newly mined. With "
            f"ResourceX, the expected scenario reaches {exp['sharePct'][-1]:.1f}% recycled ({low:.1f}% to {high:.1f}% "
            f"across scenarios), cutting virgin metal to {100 - exp['sharePct'][-1]:.0f}%.",
            f"In {impact['period']}, ResourceX matched {_n(impact['tonnesRecirculated'])} of the "
            f"{_n(impact['tonnesOffered'])} tonnes of scrap offered, avoiding about {_n(impact['co2eAvoidedT'])} tonnes "
            f"of CO2e (carbon dioxide and other greenhouse gases) after trucking, and buyers paid "
            f"A${_n(impact['moneySavedAud'])} less than they had budgeted.",
            f"The {bau[0]:.0f}% starting point is the world average recycled share for this dataset's metals (mostly "
            f"steel), from IEA, IAI, ICA and worldstainless figures. These figures come from a demonstration dataset, "
            f"not recorded trades.",
        ],
        "highlights": [
            f"Virgin metal falls from {100 - bau[-1]:.0f}% to {100 - exp['sharePct'][-1]:.0f}% of what these "
            f"manufacturers buy in 2035 (expected scenario).",
            f"This month: {_n(impact['tonnesRecirculated'])} tonnes of scrap matched, avoiding "
            f"{_n(impact['co2eAvoidedT'])} tonnes of CO2e.",
            f"{top['material'].capitalize()} is {tonnes_share:.0%} of the tonnes but {share:.0%} of the CO2e avoided.",
        ],
        "source": "template",
        "model": None,
        "note": note,
    }


def write_report(impact: dict) -> dict:
    """Ask Claude for the report; fall back to the template when there is no key or the call fails."""
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return template_report(impact, "Add ANTHROPIC_API_KEY to backend/.env for an AI-written report.")

    client = anthropic.Anthropic(timeout=90.0, max_retries=1)
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": "Write this month's report from this data:\n\n" + json.dumps(_prompt_data(impact), indent=1),
            }],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": REPORT_SCHEMA}},
            # On a safety decline, the API retries on a fallback model inside the same call.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        log.warning("Report: Anthropic API key was rejected")
        return template_report(impact, "The Anthropic API key was rejected; showing the template report.")
    except anthropic.RateLimitError:
        log.warning("Report: rate limited")
        return template_report(impact, "The AI service is busy; showing the template report. Try again shortly.")
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        log.warning("Report: Claude call failed: %s", e)
        return template_report(impact, "The AI service could not be reached; showing the template report.")

    if response.stop_reason != "end_turn":
        log.warning("Report: unexpected stop_reason %s", response.stop_reason)
        return template_report(impact, "The AI report was incomplete; showing the template report.")
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        report = json.loads(text)
    except json.JSONDecodeError:
        log.warning("Report: response was not valid JSON")
        return template_report(impact, "The AI report could not be read; showing the template report.")
    return {**report, "source": "claude", "model": response.model, "note": None}
