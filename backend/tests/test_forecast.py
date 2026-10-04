import datetime as dt

import pytest

from backend.app.forecast import BASE_YEAR, END_YEAR, RECYCLED_SHARE, bau_share
from backend.app.impact import allocate, impact_for


@pytest.fixture(scope="module")
def outlook(marketplace):
    return impact_for(*marketplace)["outlook"]


def test_years_and_series_line_up(outlook):
    assert outlook["years"] == list(range(BASE_YEAR, END_YEAR + 1))
    assert len(outlook["businessAsUsualPct"]) == len(outlook["years"])
    assert all(len(s["sharePct"]) == len(outlook["years"]) for s in outlook["scenarios"])


def test_resourcex_is_never_below_business_as_usual_or_above_the_ceiling(outlook):
    for s in outlook["scenarios"]:
        for with_cl, bau in zip(s["sharePct"], outlook["businessAsUsualPct"]):
            assert bau <= with_cl <= outlook["ceilingPct"]


def test_scenarios_are_ordered_and_rise(outlook):
    conservative, expected, ambitious = (s["sharePct"] for s in outlook["scenarios"])
    assert all(c <= e <= a for c, e, a in zip(conservative, expected, ambitious))
    for series in (conservative, expected, ambitious):
        assert all(b >= a for a, b in zip(series, series[1:]))


def test_base_year_is_baseline_plus_november_matches(marketplace):
    producers, manufacturers = marketplace
    trades = allocate(producers, manufacturers)
    total_input = sum(m["required_quantity_t"] / RECYCLED_SHARE[m["required_material"]].now for m in manufacturers)
    headroom = {
        k: sum(m["required_quantity_t"] for m in manufacturers if m["required_material"] == k)
        / RECYCLED_SHARE[k].now * (RECYCLED_SHARE[k].ceiling - RECYCLED_SHARE[k].now)
        for k in RECYCLED_SHARE
    }
    matched = {k: min(sum(t.tonnes for t in trades if t.material == k), headroom[k]) for k in RECYCLED_SHARE}
    tenders = sum(m["required_quantity_t"] for m in manufacturers)
    expected_pct = 100 * (tenders + sum(matched.values())) / total_input
    assert impact_for(producers, manufacturers)["outlook"]["scenarios"][0]["sharePct"][0] == pytest.approx(expected_pct, abs=0.05)


def test_business_as_usual_follows_industry_outlooks():
    assert bau_share("steel", END_YEAR) == RECYCLED_SHARE["steel"].now  # no growth expected
    assert bau_share("aluminium", 2050) == pytest.approx(0.50)  # IAI: half of demand by 2050
    assert RECYCLED_SHARE["aluminium"].now < bau_share("aluminium", END_YEAR) < 0.50


def test_hand_worked_single_tender():
    producers = [dict(name="P", abn="11111111111", lat=None, lng=None, output_material="steel", output_quantity_t=33,
                      output_grade="high", price_aud_per_t=300, is_synthetic=True)]
    manufacturers = [dict(name="M", abn="22222222222", lat=None, lng=None, required_material="steel",
                          required_quantity_t=330, max_price_aud_per_t=400, output_grade_request="medium",
                          order_by=dt.date(2026, 11, 7))]
    o = impact_for(producers, manufacturers)["outlook"]
    # 330 t tender at 33% recycled -> 1,000 t of steel a month. 33 t matched -> 36.3% in 2026.
    assert o["metalInputTonnesPerMonth"] == 1000
    assert o["businessAsUsualPct"][0] == 33.0
    assert o["scenarios"][0]["sharePct"][0] == 36.3
    # Conservative: 33 t growing 10% a year stays under the 48% steel ceiling, so 2035 = 33% + 33*1.1^9/1000.
    assert o["scenarios"][0]["sharePct"][-1] == pytest.approx(33 + 100 * 33 * 1.1 ** 9 / 1000, abs=0.05)
    # Ambitious hits the ceiling.
    assert o["scenarios"][2]["sharePct"][-1] == 48.0


def test_today_is_the_dataset_weighted_world_average(outlook):
    """'Today' is each metal's world recycled share, weighted by how much of it the dataset's manufacturers use."""
    baselines = outlook["baselines"]
    assert sum(b["mixPct"] for b in baselines) == pytest.approx(100, abs=0.2)
    weighted = sum(b["mixPct"] * b["nowPct"] for b in baselines) / 100
    assert weighted == pytest.approx(outlook["businessAsUsualPct"][0], abs=0.1)
    assert all(b["sourceName"] and b["url"] for b in baselines)
