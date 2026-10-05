"""Validate the additional-work split: parts (item cost) are tax/commission free and
go 100% to the partner; commission applies ONLY to labour; GST only on that commission.
Mirrors the user's example: 300 item + 100 labour @ 20% commission, 18% GST."""
import os
import asyncio

# Motor client is lazy — a dummy URL lets the controller module import without a live DB.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_logic")

from controllers.booking_controller import _recompute_additional  # noqa: E402


def _run(items, partner_pct=80, gst_pct=18):
    booking = {"commission_config": {"commission": {"partner_pct": partner_pct}},
               "additional": {"items": items}}
    settings = {"gst_pct": gst_pct}
    return asyncio.run(_recompute_additional(booking, settings))


def test_item_cost_plus_labour_split():
    r = _run([{"part_charge": 300, "labour_charge": 100}])  # 20% commission, 18% GST
    assert r["parts_total"] == 300, r
    assert r["labour_total"] == 100, r
    assert r["commission"] == 20, r            # 100 x 20%
    assert round(r["gst"], 2) == 3.6, r        # 18% of the 20 commission only
    assert round(r["total"], 2) == 403.6, r    # 300 + 100 + 3.6
    assert r["partner_earning"] == 380, r      # 300 parts + 80 labour
    assert round(r["platform_earning"], 2) == 23.6, r  # 20 commission + 3.6 GST


def test_item_with_no_labour_is_fully_partner_tax_free():
    r = _run([{"part_charge": 149, "labour_charge": 0}])
    assert r["parts_total"] == 149, r
    assert r["labour_total"] == 0, r
    assert r["commission"] == 0, r
    assert r["gst"] == 0, r
    assert r["total"] == 149, r
    assert r["partner_earning"] == 149, r
    assert r["platform_earning"] == 0, r


if __name__ == "__main__":
    test_item_cost_plus_labour_split()
    test_item_with_no_labour_is_fully_partner_tax_free()
    print("ALL PASS ✅")
