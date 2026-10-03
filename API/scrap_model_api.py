"""NSW TENDER MATCHING API — single-file UI handoff, version 2.

This replaces the earlier price-prediction API with constrained supplier matching.
Both producer and manufacturer modes use actual supplied quantities/prices.
No LightGBM weights, training, Excel files or GPU are required at runtime.

INSTALL (Python 3.11+):
  python -m pip install "numpy>=1.26,<3" "scipy>=1.11,<2" "fastapi>=0.115,<1" "pydantic>=2.9,<3" "uvicorn>=0.30,<1"
RUN:
  python scrap_model_api.py --port 8000
  Open http://127.0.0.1:8000/docs for request schemas and interactive examples.

ENDPOINTS:
  GET  /health       Health and matching capabilities.
  GET  /catalog      Embedded 63-producer / 61-tender synthetic demo catalog.
  POST /match        Manufacturer: rank supplier combinations for a tender.
  POST /collaborate  Producer: as /match, but requires anchor_producer_id.
  POST /match-demo   Match an embedded tender by tender_id, optional anchor.

REQUEST EXAMPLE (POST /collaborate):
{
 "tender":{"id":"T1","material":"Steel","grade":"High quality",
   "quantity_tonnes":200,"budget_aud":250000,
   "window_start":"2026-11-01","window_end":"2026-11-30"},
 "producers":[
   {"id":"A","name":"Producer A","material":"Steel","grade":"High quality",
    "quantity_tonnes":100,"price_aud_per_tonne":1000,
    "available_from":"2026-11-01","available_to":"2026-11-30"},
   {"id":"B","name":"Producer B","material":"Steel","grade":"High quality",
    "quantity_tonnes":100,"price_aud_per_tonne":1200,
    "available_from":"2026-11-01","available_to":"2026-11-30"}],
 "anchor_producer_id":"A","anchor_quantity_tonnes":100,"top_k":3
}
Expected: A=100 tonnes + B=100 tonnes, cost AUD 220000, budget remaining 30000.
PRICE UNITS: A's 100 tonnes costing $100000 means price_aud_per_tonne=1000.

JS INTEGRATION:
const r = await fetch('http://127.0.0.1:8000/match-demo', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({tender_id:selectedTenderId, top_k:3})
});
const data = await r.json();
if (!r.ok) throw new Error(JSON.stringify(data.detail));
// data.status is 'feasible' or 'infeasible'; render data.recommendations.
// Add anchor_producer_id to recommend collaborators for that producer.

PYTHON: from scrap_model_api import match; result = match(request_dict)
CORS: set UI_ORIGINS to comma-separated frontend origins. Defaults: localhost
and 127.0.0.1 ports 3000/5173. --host 0.0.0.0 binds for hosted/container use.

MATCHING CONTRACT:
- Exact material and grade (case-insensitive); no assumed grade substitutions.
- Every supplier must possess every requested certification tag.
- Availability must overlap the tender's delivery window; a proposed delivery
  date is returned. Dates describe availability, not guaranteed transit times.
- Exclude buyer's own producer ID. IDs must identify distinct businesses.
- Quantities are divisible in 0.001-tonne units; partial lots allowed. Prices
  are constant AUD/tonne, up to 2 decimals, with no bulk discounts/fixed fees.
- Exact required quantity, within budget, no supplier above available stock.
- Producer mode fixes the anchor's contribution (default: min(stock, demand)).
- rank_by='lowest_cost' minimizes cost then supplier count;
  'fewest_suppliers' minimizes count then cost. Alternatives have different
  supplier sets and exclude supersets of already recommended teams (avoids
  padding a feasible team with unnecessary partners). They are mutually
  exclusive proposals, not reservations.
- max_suppliers and top_k bound combinations. Equal-score ties may vary.
- Solver timeouts return HTTP 503; they are never reported as infeasible.
- Transport, tax, distance, payment terms and simultaneous tender reservations
  are NOT modeled. Budget and prices must be on the same basis. Caller must
  supply up-to-date remaining inventory, and reserve it in its own database.
- Embedded catalog is a frozen SYNTHETIC November 2026 demo. Cert A-E are demo
  tags. Custom requests are evaluated as supplied, without checking real firms.

MILP reference: https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html
"""
from __future__ import annotations
import argparse
import base64
from datetime import date
from decimal import Decimal
import json
import os
import threading
from typing import Literal
import zlib

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_CATALOG = json.loads(zlib.decompress(base64.b64decode('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')))
_SOLVER_LOCK = threading.Lock()
NOTICE = 'Feasibility uses supplied values, not predicted prices. Alternatives do not reserve inventory. Transport and tax are excluded unless included in supplied prices.'


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class QuantityModel(StrictModel):
    quantity_tonnes: float = Field(gt=0, le=1000000)

    @field_validator('quantity_tonnes', mode='before')
    @classmethod
    def quantity_precision(cls, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError('Quantity must be a JSON number.')
        d = Decimal(str(value))
        if not d.is_finite() or d * 1000 != (d * 1000).to_integral_value():
            raise ValueError('Quantity must be finite and have at most 3 decimal places.')
        return value


class Producer(QuantityModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    material: str = Field(min_length=1, max_length=100)
    grade: str = Field(min_length=1, max_length=100)
    price_aud_per_tonne: float = Field(ge=0, le=100000000)
    available_from: date
    available_to: date
    certifications: list[str] = Field(default_factory=list, max_length=50)

    @field_validator('price_aud_per_tonne', mode='before')
    @classmethod
    def money(cls, value):
        return money(value)

    @model_validator(mode='after')
    def dates(self):
        if self.available_to < self.available_from:
            raise ValueError('available_to precedes available_from')
        return self


def money(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('Money must be a JSON number.')
    d = Decimal(str(value))
    if not d.is_finite() or d * 100 != (d * 100).to_integral_value():
        raise ValueError('Money must be finite and have at most 2 decimal places.')
    return value


class Tender(QuantityModel):
    id: str = Field(min_length=1, max_length=100)
    buyer_name: str | None = Field(default=None, min_length=1, max_length=200)
    buyer_id: str | None = Field(default=None, min_length=1, max_length=100)
    material: str = Field(min_length=1, max_length=100)
    grade: str = Field(min_length=1, max_length=100)
    budget_aud: float = Field(ge=0, le=1000000000000)
    window_start: date
    window_end: date
    required_certifications: list[str] = Field(default_factory=list, max_length=50)

    @field_validator('budget_aud', mode='before')
    @classmethod
    def budget(cls, value):
        return money(value)

    @model_validator(mode='after')
    def dates(self):
        if self.window_end < self.window_start:
            raise ValueError('window_end precedes window_start')
        return self


class Options(StrictModel):
    anchor_producer_id: str | None = Field(default=None, min_length=1, max_length=100)
    anchor_quantity_tonnes: float | None = Field(default=None, gt=0, le=1000000)
    top_k: int = Field(default=3, ge=1, le=5, strict=True)
    max_suppliers: int = Field(default=20, ge=1, le=100, strict=True)
    rank_by: Literal['lowest_cost', 'fewest_suppliers'] = 'lowest_cost'

    @field_validator('anchor_quantity_tonnes', mode='before')
    @classmethod
    def quantity(cls, value):
        return None if value is None else QuantityModel.quantity_precision(value)

    @model_validator(mode='after')
    def anchor(self):
        if self.anchor_quantity_tonnes is not None and self.anchor_producer_id is None:
            raise ValueError('anchor_quantity_tonnes requires anchor_producer_id')
        return self


class MatchRequest(Options):
    tender: Tender
    producers: list[Producer] = Field(min_length=1, max_length=100)

    @model_validator(mode='after')
    def identities(self):
        ids = [p.id for p in self.producers]
        if len(ids) != len(set(ids)):
            raise ValueError('Duplicate producer IDs: inventory must appear once per business.')
        if self.anchor_producer_id is not None and self.anchor_producer_id not in ids:
            raise ValueError('anchor_producer_id does not exist in producers')
        return self


class DemoRequest(Options):
    tender_id: str


def units(quantity):
    return int(Decimal(str(quantity)) * 1000)


def normalize(value):
    return value.strip().casefold()


def match(payload: dict | MatchRequest):
    request = payload if isinstance(payload, MatchRequest) else MatchRequest.model_validate(payload)
    tender = request.tender
    eligible, excluded = [], []
    for p in sorted(request.producers, key=lambda p: p.id):
        reasons = []
        if tender.buyer_id == p.id:
            reasons.append('Buyer cannot supply its own tender.')
        if normalize(p.material) != normalize(tender.material):
            reasons.append('Material mismatch.')
        if normalize(p.grade) != normalize(tender.grade):
            reasons.append('Grade mismatch.')
        if max(p.available_from, tender.window_start) > min(p.available_to, tender.window_end):
            reasons.append('No overlap with delivery window.')
        if not {normalize(c) for c in tender.required_certifications} <= {normalize(c) for c in p.certifications}:
            reasons.append('Missing required certifications.')
        if reasons:
            excluded.append({'producer_id': p.id, 'reasons': reasons})
        else:
            eligible.append(p)
    result = {'status': 'infeasible', 'tender_id': tender.id, 'notice': NOTICE,
        'rank_by': request.rank_by, 'anchor_producer_id': request.anchor_producer_id,
        'eligible_producer_count': len(eligible), 'excluded': excluded, 'recommendations': [],
        'quantity_resolution_tonnes': 0.001}
    if request.anchor_producer_id and request.anchor_producer_id not in [p.id for p in eligible]:
        result['reason'] = 'Selected producer is incompatible with this tender; see excluded.'
        return result
    demand = units(tender.quantity_tonnes)
    capacity = np.array([min(units(p.quantity_tonnes), demand) for p in eligible], dtype=float)
    if not eligible or sum(capacity) < demand:
        result['reason'] = 'Insufficient compatible inventory.'
        result['shortfall_tonnes'] = (demand - int(sum(capacity))) / 1000
        return result
    n = len(eligible)
    # x = [integer kilogram allocations, binary supplier selections].
    cost = np.array([p.price_aud_per_tonne / 1000 for p in eligible] + [0.] * n)
    count = np.array([0.] * n + [1.] * n)
    lower = np.zeros(2 * n)
    upper = np.r_[capacity, np.ones(n)]
    rows, lows, highs = [], [], []

    def constraint(row, low=-np.inf, high=np.inf):
        rows.append(row); lows.append(low); highs.append(high)

    constraint(np.r_[np.ones(n), np.zeros(n)], demand, demand)
    constraint(cost, high=tender.budget_aud)
    constraint(count, high=request.max_suppliers)
    for i in range(n):
        row = np.zeros(2 * n); row[i] = 1; row[n + i] = -capacity[i]
        constraint(row, high=0)
        row = np.zeros(2 * n); row[i] = 1; row[n + i] = -1
        constraint(row, low=0)  # Every selected supplier contributes at least 1 kg.
    if request.anchor_producer_id:
        i = [p.id for p in eligible].index(request.anchor_producer_id)
        contribution = units(request.anchor_quantity_tonnes) if request.anchor_quantity_tonnes is not None else int(capacity[i])
        if contribution > capacity[i]:
            result['reason'] = 'Anchor contribution exceeds its available quantity or tender demand.'
            return result
        lower[i] = upper[i] = contribution
    first, second = (cost, count) if request.rank_by == 'lowest_cost' else (count, cost)

    def solve(objective, extra=None):
        constraints = [LinearConstraint(np.array(rows), np.array(lows), np.array(highs))]
        if extra is not None:
            constraints.append(extra)
        with _SOLVER_LOCK:
            solved = milp(objective, integrality=np.ones(2 * n), bounds=Bounds(lower, upper),
                constraints=constraints, options={'time_limit': 5.0, 'mip_rel_gap': 0.0})
        if solved.status == 2:
            return None
        if solved.status != 0:
            raise RuntimeError('Matching could not prove an optimal answer within solver limits. Reduce producers/top_k and retry.')
        return solved

    for _ in range(request.top_k):
        primary = solve(first)
        if primary is None:
            break
        tie_bound = float(first @ np.rint(primary.x))
        secondary = solve(second, LinearConstraint(first, -np.inf, tie_bound + 1e-7))
        if secondary is None:
            raise RuntimeError('Solver failed during tie-breaking.')
        solution = np.rint(secondary.x).astype(np.int64)
        q = solution[:n]
        selected = np.flatnonzero(q > 0)
        # Independent exact-decimal postcheck before returning ANY proposal.
        total = sum(Decimal(str(p.price_aud_per_tonne)) * Decimal(int(q[i])) / 1000
                    for i, p in enumerate(eligible))
        if int(q.sum()) != demand or np.any(q < 0) or np.any(q > capacity) or total > Decimal(str(tender.budget_aud)) or len(selected) > request.max_suppliers:
            raise RuntimeError('Solver allocation failed exact feasibility verification.')
        allocations = []
        for i in selected:
            p = eligible[i]
            line_cost = Decimal(str(p.price_aud_per_tonne)) * Decimal(int(q[i])) / 1000
            allocations.append({'producer_id': p.id, 'name': p.name, 'quantity_tonnes': int(q[i]) / 1000,
                'price_aud_per_tonne': p.price_aud_per_tonne, 'cost_aud': float(line_cost),
                'remaining_stock_tonnes': (units(p.quantity_tonnes) - int(q[i])) / 1000,
                'proposed_delivery_date': max(p.available_from, tender.window_start).isoformat(),
                'is_anchor': p.id == request.anchor_producer_id})
        result['recommendations'].append({'rank': len(result['recommendations']) + 1,
            'allocations': allocations, 'supplier_count': len(allocations),
            'total_quantity_tonnes': tender.quantity_tonnes, 'total_cost_aud': float(total),
            'budget_remaining_aud': float(Decimal(str(tender.budget_aud)) - total),
            'partner_ids': [a['producer_id'] for a in allocations if not a['is_anchor']],
            'constraints_verified': True})
        # Exclude this team and its supersets, avoiding redundant partner additions.
        cut = np.zeros(2 * n)
        cut[n + selected] = 1
        constraint(cut, high=len(selected) - 1)
    if result['recommendations']:
        result['status'] = 'feasible'
    else:
        result['reason'] = 'No combination satisfies budget, supplier-count limit and any fixed anchor contribution.'
    return result


app = FastAPI(title='Tender & Producer Collaboration API', version='2.0.0', description=NOTICE)
app.add_middleware(CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv('UI_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173').split(',') if x.strip()],
    allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


@app.exception_handler(RequestValidationError)
async def invalid(_, exc):
    return JSONResponse(status_code=422, content={'detail': [
        {'loc': list(e['loc']), 'msg': e['msg'], 'type': e['type']} for e in exc.errors()]})


@app.get('/health')
def health():
    return {'status': 'ok', 'version': '2.0.0', 'engine': 'constrained_tender_matching',
            'capabilities': ['manufacturer_supplier_matching', 'producer_collaboration']}


@app.get('/catalog')
def catalog():
    return _CATALOG


def execute(request):
    try:
        return match(request)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post('/match')
def match_endpoint(request: MatchRequest):
    return execute(request)


@app.post('/collaborate')
def collaborate(request: MatchRequest):
    if request.anchor_producer_id is None:
        raise HTTPException(status_code=422, detail='Producer mode requires anchor_producer_id.')
    return execute(request)


@app.post('/match-demo')
def demo(request: DemoRequest):
    tender = next((t for t in _CATALOG['tenders'] if t['id'] == request.tender_id), None)
    if tender is None:
        raise HTTPException(status_code=404, detail='Unknown tender_id; use GET /catalog.')
    if request.anchor_producer_id is not None and request.anchor_producer_id not in {p['id'] for p in _CATALOG['producers']}:
        raise HTTPException(status_code=422, detail='Unknown anchor_producer_id.')
    values = request.model_dump(exclude={'tender_id'})
    response = execute(MatchRequest(tender=tender, producers=_CATALOG['producers'], **values))
    response['synthetic_demo'] = True
    return response


if __name__ == '__main__':
    import uvicorn
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
