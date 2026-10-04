import datetime as dt

import pytest

from backend.app.forecast import (BASE_YEAR, END_YEAR, HEADLINE_SEGMENT, PROCESS_SOURCES, RECYCLED_SHARE,
                                  bau_share, load_profiles, profile_for)
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


def test_base_year_is_profiles_plus_matched_scrap(marketplace):
    """2026 = each SME buyer's recycled share today plus the scrap ResourceX matched for it, capped at its limit."""
    producers, manufacturers = marketplace
    got = {}
    for t in allocate(producers, manufacturers):
        got[t.manufacturer["abn"]] = got.get(t.manufacturer["abn"], 0) + t.tonnes
    sme = [(profile_for(m), got.get(m["abn"], 0)) for m in manufacturers]
    sme = [(p, g) for p, g in sme if p.segment == HEADLINE_SEGMENT]
    use = sum(p.use for p, _ in sme)
    expected = 100 * sum(p.use * p.now + min(g, p.use * (p.limit - p.now)) for p, g in sme) / use
    assert impact_for(producers, manufacturers)["outlook"]["scenarios"][0]["sharePct"][0] == pytest.approx(expected, abs=0.05)


def test_steel_mills_are_counted_in_tonnes_not_in_the_share(outlook, marketplace):
    _, manufacturers = marketplace
    mills = outlook["mills"]
    assert {b["name"] for b in mills["buyers"]} == {"InfraBuild Sydney Steel Mill", "BlueScope Port Kembla Steelworks"}
    assert outlook["buyers"] == len(manufacturers) - 2
    assert mills["metalUseTonnesPerMonth"] > 50 * outlook["metalInputTonnesPerMonth"]  # why they'd swamp the share


def test_every_profile_matches_a_buyer(marketplace):
    _, manufacturers = marketplace
    abns = {m["abn"] for m in manufacturers}
    profiles = load_profiles()
    assert profiles and set(profiles) <= abns
    for row in profiles.values():
        assert 0 < float(row["recycled_share_now"]) <= float(row["recycled_share_limit"]) <= 1
        assert row["process"] in PROCESS_SOURCES


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


def test_today_is_weighted_by_metal_use(outlook):
    """'Today' is each kind of buyer's recycled share, weighted by how much metal those buyers use."""
    baselines = outlook["baselines"]
    assert sum(b["mixPct"] for b in baselines) == pytest.approx(100, abs=0.2)
    weighted = sum(b["mixPct"] * b["nowPct"] for b in baselines) / 100
    assert weighted == pytest.approx(outlook["businessAsUsualPct"][0], abs=0.1)
    assert all(b["sourceName"] and b["url"] for b in baselines)
