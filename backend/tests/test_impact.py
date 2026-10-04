import datetime as dt

import pytest

from backend.app.impact import (GRADE_RANK, DEFAULT_ROAD_KM, EMISSION_FACTORS, METAL_LANDFILL_SHARE, TRUCK_KG_CO2E_PER_TKM, allocate,
                        impact_for, road_km)


def producer(**kw):
    base = dict(name="P", abn="11111111111", lat=None, lng=None, output_material="steel", output_quantity_t=10,
                output_grade="high", price_aud_per_t=300, is_synthetic=True)
    return {**base, **kw}


def manufacturer(**kw):
    base = dict(name="M", abn="22222222222", lat=None, lng=None, required_material="steel", required_quantity_t=20,
                max_price_aud_per_t=400, output_grade_request="medium", order_by=dt.date(2026, 11, 7))
    return {**base, **kw}


def test_hand_worked_example():
    # Sydney CBD to Parramatta: both sites have coordinates, so the real distance is used.
    p = producer(lat=-33.8688, lng=151.2093)
    m = manufacturer(lat=-33.8150, lng=151.0011)
    km = road_km(p, m)
    r = impact_for([p], [m])

    assert r["tonnesRecirculated"] == 10
    assert r["co2eAvoidedT"] == pytest.approx(10 * 1.5 - 10 * km * TRUCK_KG_CO2E_PER_TKM / 1000, abs=0.05)
    assert r["landfillAvoidedT"] == pytest.approx(10 * METAL_LANDFILL_SHARE)
    assert r["moneySavedAud"] == 10 * (400 - 300)
    assert r["valueRecoveredAud"] == 10 * 300
    assert r["tenders"] == {"total": 1, "filled": 0, "partial": 1}


def test_missing_coordinates_use_default_haul():
    [trade] = allocate([producer()], [manufacturer()])
    assert trade.road_km == DEFAULT_ROAD_KM and trade.distance_estimated


@pytest.mark.parametrize("change", [
    {"output_material": "copper"},          # wrong material
    {"output_grade": "short_use"},          # below the requested grade
    {"price_aud_per_t": 401},               # over budget per tonne
    {"abn": "22222222222"},                 # the buyer's own scrap
])
def test_ineligible_offers_are_not_traded(change):
    assert allocate([producer(**change)], [manufacturer()]) == []


def test_supply_is_sold_once():
    m1 = manufacturer(name="Early", order_by=dt.date(2026, 11, 7))
    m2 = manufacturer(name="Late", abn="33333333333", order_by=dt.date(2026, 11, 28))
    trades = allocate([producer(output_quantity_t=25)], [m2, m1])
    assert [(t.manufacturer["name"], t.tonnes) for t in trades] == [("Early", 20), ("Late", 5)]


def test_cheapest_offer_is_used_first():
    cheap, dear = producer(name="Cheap", price_aud_per_t=250), producer(name="Dear", abn="44444444444")
    trades = allocate([dear, cheap], [manufacturer(required_quantity_t=10)])
    assert [t.producer["name"] for t in trades] == ["Cheap"]


def test_dataset_allocation_respects_every_rule(marketplace):
    producers, manufacturers = marketplace
    trades = allocate(producers, manufacturers)
    assert trades
    sold = {}
    bought = {}
    for t in trades:
        p, m = t.producer, t.manufacturer
        assert p["output_material"] == m["required_material"]
        assert GRADE_RANK[p["output_grade"]] >= GRADE_RANK[m["output_grade_request"]]
        assert p["price_aud_per_t"] <= m["max_price_aud_per_t"]
        assert p["abn"] != m["abn"]
        sold[id(p)] = sold.get(id(p), 0) + t.tonnes
        bought[id(m)] = bought.get(id(m), 0) + t.tonnes
    assert all(sold[id(p)] <= p["output_quantity_t"] for p in producers if id(p) in sold)
    assert all(bought[id(m)] <= m["required_quantity_t"] for m in manufacturers if id(m) in bought)


def test_dataset_totals_add_up(marketplace):
    producers, manufacturers = marketplace
    r = impact_for(producers, manufacturers)
    assert r["tonnesRecirculated"] == pytest.approx(sum(b["tonnes"] for b in r["byMaterial"]), abs=0.5)
    assert r["co2eAvoidedT"] == pytest.approx(sum(b["co2eAvoidedT"] for b in r["byMaterial"]), abs=0.5)
    assert r["tonnesRecirculated"] <= r["tonnesOffered"]
    assert r["isSample"] is True
    assert {b["material"] for b in r["byMaterial"]} == set(EMISSION_FACTORS)


def test_dataset_sites_all_have_coordinates(marketplace):
    """The marketplace database geocodes every site, so no trade falls back to the default haul."""
    producers, manufacturers = marketplace
    assert not [t for t in allocate(producers, manufacturers) if t.distance_estimated]


def test_materials_without_factors_are_skipped():
    plastics = producer(output_material="plastics", abn="55555555555")
    r = impact_for([producer(), plastics], [manufacturer()])
    assert r["tonnesRecirculated"] == 10
    assert any("not counted" in a for a in r["assumptions"])


def test_buyers_paying_most_go_first():
    """Reuse of good offcuts (higher price per tonne) is served before melting."""
    mill = manufacturer(name="Mill", abn="33333333333", max_price_aud_per_t=480, order_by=dt.date(2026, 11, 1))
    reuse = manufacturer(name="Fabricator", abn="44444444444", max_price_aud_per_t=1000, order_by=dt.date(2026, 11, 20))
    trades = allocate([producer(output_quantity_t=20)], [mill, reuse])
    assert [(t.manufacturer["name"], t.tonnes) for t in trades] == [("Fabricator", 20)]
