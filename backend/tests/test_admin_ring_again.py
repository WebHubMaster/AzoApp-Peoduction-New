"""Iteration 8: Admin 'Ring again' — POST /api/admin/bookings/{bid}/ring-partner/{pid}"""
import json
import threading
import time

import pytest
import requests

from conftest import API, login, client


# ---------- helpers ----------
def _searching_booking(admin):
    r = admin.get(f"{API}/admin/bookings", params={"status": "searching"}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    rows = data if isinstance(data, list) else data.get("bookings", [])
    return rows


def _feed(admin, **params):
    r = admin.get(f"{API}/admin/dispatch-feed", params=params, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    return d if isinstance(d, list) else (d.get("rows") or d.get("feed") or d.get("items") or [])


@pytest.fixture(scope="module")
def target(admin):
    """A searching booking + one of its dispatched partners (from the dispatch feed)."""
    rows = _searching_booking(admin)
    if not rows:
        pytest.fail("No booking in 'searching' status to test ring-partner against")
    ids = {b["id"]: b for b in rows}
    for row in _feed(admin, limit=200):
        bid = row.get("booking_id")
        if bid in ids and row.get("partner_id"):
            return {"booking": ids[bid], "booking_id": bid, "partner_id": row["partner_id"],
                    "partner_name": row.get("partner_name")}
    # fallback: use eligible partners of the first searching booking
    b = rows[0]
    r = admin.get(f"{API}/admin/bookings/{b['id']}/eligible-partners", timeout=60)
    if r.status_code == 200:
        d = r.json()
        plist = d if isinstance(d, list) else (d.get("partners") or [])
        if plist:
            return {"booking": b, "booking_id": b["id"], "partner_id": plist[0]["id"],
                    "partner_name": plist[0].get("name")}
    pytest.fail("Could not resolve a (searching booking, partner) pair")


# ---------- module: admin ring-partner ----------
class TestAdminRingPartner:
    def test_ring_partner_success(self, admin, target):
        bid, pid = target["booking_id"], target["partner_id"]
        before = [r for r in _feed(admin, booking_id=bid) if r.get("partner_id") == pid]

        r = admin.post(f"{API}/admin/bookings/{bid}/ring-partner/{pid}", timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True, d
        bk = d["booking"]
        assert bk["id"] == bid
        assert bk["status"] == "searching"
        assert isinstance(bk.get("code"), str) and bk["code"]
        assert bk.get("service_name")
        assert "test" not in (bk["service_name"] or "").lower()
        assert d["partner"]["id"] == pid
        assert d["partner"].get("name")
        assert "partner_status" in d["partner"]
        push = d.get("push") or {}
        assert set(push.keys()) <= {"push_success", "push_failure", "push_skipped"}
        print("push:", push)

        # NEW feed row with source=admin_ring, response=pending
        time.sleep(1)
        after = [r for r in _feed(admin, booking_id=bid) if r.get("partner_id") == pid]
        assert len(after) > len(before), f"no new dispatch row created ({len(before)} -> {len(after)})"
        admin_rows = [r for r in after if r.get("source") == "admin_ring"]
        assert admin_rows, f"no admin_ring row: {[r.get('source') for r in after]}"
        newest = sorted(admin_rows, key=lambda x: x.get("dispatched_at") or "")[-1]
        assert newest.get("response") == "pending", newest

        # older pending rows for this partner superseded to timeout
        pendings = [r for r in after if r.get("response") == "pending"]
        assert len(pendings) == 1, f"expected exactly 1 pending row for partner, got {len(pendings)}"

        # booking arrays updated
        det = admin.get(f"{API}/admin/bookings/{bid}/detail", timeout=60)
        assert det.status_code == 200, det.text
        b = det.json().get("booking") or det.json()
        assert pid in (b.get("eligible_partner_ids") or []), b.get("eligible_partner_ids")
        assert pid in (b.get("offered_partner_ids") or []), b.get("offered_partner_ids")
        target["code"] = bk["code"]
        target["service_name"] = bk["service_name"]

    def test_partner_ring_pending_has_real_job(self, admin, target):
        """As the rung partner, ring-pending must include the booking with the REAL service name."""
        assert target.get("code"), "depends on previous test"
        r = admin.get(f"{API}/admin/users/{target['partner_id']}/detail", timeout=60)
        assert r.status_code == 200, r.text
        u = r.json().get("user") or r.json()
        phone = u.get("phone")
        assert phone, u
        ptok = login(phone)
        pc = client(ptok)
        rp = pc.get(f"{API}/bookings/partner/ring-pending", timeout=60)
        assert rp.status_code == 200, rp.text
        d = rp.json()
        jobs = d if isinstance(d, list) else (d.get("jobs") or d.get("bookings") or d.get("rings") or [])
        codes = [j.get("code") for j in jobs]
        assert target["code"] in codes, f"{target['code']} not in ring-pending {codes}"
        job = [j for j in jobs if j.get("code") == target["code"]][0]
        assert job.get("service_name") == target["service_name"], job
        assert not job.get("is_test"), job

    def test_ring_non_searching_booking_400(self, admin):
        r = admin.get(f"{API}/admin/bookings", timeout=60)
        rows = r.json() if isinstance(r.json(), list) else r.json().get("bookings", [])
        done = [b for b in rows if b.get("status") in ("completed", "assigned", "cancelled", "in_progress")]
        if not done:
            pytest.skip("no non-searching booking available")
        b = done[0]
        pid = (b.get("partner_id") or (b.get("eligible_partner_ids") or [None])[0])
        if not pid:
            feed = _feed(admin, booking_id=b["id"])
            pid = feed[0]["partner_id"] if feed else None
        if not pid:
            pytest.skip("no partner id for non-searching booking")
        resp = admin.post(f"{API}/admin/bookings/{b['id']}/ring-partner/{pid}", timeout=60)
        assert resp.status_code == 400, f"{resp.status_code}: {resp.text[:300]}"
        assert b["status"] in resp.json().get("detail", ""), resp.text

    def test_unknown_partner_404(self, admin, target):
        r = admin.post(f"{API}/admin/bookings/{target['booking_id']}/ring-partner/does-not-exist-999", timeout=60)
        assert r.status_code == 404, f"{r.status_code}: {r.text[:300]}"

    def test_unknown_booking_404(self, admin, target):
        r = admin.post(f"{API}/admin/bookings/no-such-booking-999/ring-partner/{target['partner_id']}", timeout=60)
        assert r.status_code == 404, f"{r.status_code}: {r.text[:300]}"

    def test_non_admin_forbidden(self, customer, anon, target):
        u = f"{API}/admin/bookings/{target['booking_id']}/ring-partner/{target['partner_id']}"
        r1 = customer.post(u, timeout=60)
        assert r1.status_code in (401, 403), r1.status_code
        r2 = anon.post(u, timeout=60)
        assert r2.status_code in (401, 403), r2.status_code


    # ---------- SSE realtime (kept in this class so xdist loadscope runs it on the
    # same worker, sequentially — parallel rings on the same booking race) ----------
    def test_z_sse(self, admin, target):
        r = admin.get(f"{API}/admin/users/{target['partner_id']}/detail", timeout=60)
        u = r.json().get("user") or r.json()
        ptok = login(u["phone"])
        events = []

        def listen():
            try:
                with requests.get(f"{API}/realtime/stream", params={"token": ptok},
                                  stream=True, timeout=45) as resp:
                    ev = None
                    for raw in resp.iter_lines(decode_unicode=True):
                        if raw is None:
                            continue
                        line = raw.strip()
                        if line.startswith("event:"):
                            ev = line.split(":", 1)[1].strip()
                        elif line.startswith("data:"):
                            payload = line.split(":", 1)[1].strip()
                            try:
                                payload = json.loads(payload)
                            except Exception:
                                pass
                            # broker events carry no `event:` line; type is in the JSON
                            name = payload.get("type") if isinstance(payload, dict) and payload.get("type") else ev
                            events.append((name, payload.get("data") if isinstance(payload, dict) and "data" in payload else payload))
                            if name == "job_request":
                                return
            except Exception as e:  # noqa
                events.append(("error", str(e)))

        t = threading.Thread(target=listen, daemon=True)
        t.start()
        time.sleep(4)
        rr = admin.post(f"{API}/admin/bookings/{target['booking_id']}/ring-partner/{target['partner_id']}", timeout=90)
        assert rr.status_code == 200, rr.text
        code = rr.json()["booking"]["code"]
        t.join(timeout=30)
        jr = [p for e, p in events if e == "job_request"]
        assert jr, f"no job_request SSE event. events seen: {[e for e, _ in events][:10]}"
        data = jr[0]
        assert isinstance(data, dict), data
        assert data.get("code") == code, data
        assert not data.get("is_test"), data


# ---------- module: regressions ----------
class TestRingRegressions:
    def test_test_ring_still_works(self, admin, target):
        r = admin.post(f"{API}/admin/partners/{target['partner_id']}/test-ring", timeout=60)
        assert r.status_code == 200, r.text
        assert r.json().get("partner", {}).get("id") == target["partner_id"]

    def test_dispatch_timeline_has_admin_ring_lane(self, admin, target):
        r = admin.get(f"{API}/admin/bookings/{target['booking_id']}/dispatch-timeline", timeout=60)
        assert r.status_code == 200, r.text
        blob = json.dumps(r.json())
        assert "admin_ring" in blob, blob[:500]
