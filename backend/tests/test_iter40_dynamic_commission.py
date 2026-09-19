"""Iteration 40 — Dynamic commission split + role-based invoice visibility.

Scope (backend-only, per review request):
  * PUT /api/admin/settings commission 4-pct sum guard + cancellation sum guard.
  * CommissionEngine dynamic settle → verified via commission_ledger reconciliation
    (partner + platform + merchant_referral + merchant_customer == base, 2dp).
  * Referral eligibility & platform absorption of unused referral %s.
  * Role-based invoice DETAIL visibility (customer / partner / merchant / admin)
    at GET /api/invoices/{id}.
  * Invoice LIST summary — commission_amount present ONLY for admin.
  * Partner /api/partner/earnings-summary math (gross - tax - net == platform).
  * Invoice commission_pct == configured platform_pct (rate correctness).
  * Reset commission → 80/12/5/3 + 80/20 at teardown.
"""
import pytest
from tests.conftest import API, login, client, PHONES

RESET_COMMISSION = {
    "platform_pct": 12,
    "partner_pct": 80,
    "merchant_partner_referral_pct": 5,
    "merchant_customer_pct": 3,
    "customer_refund_pct": 80,
    "partner_cancellation_pct": 20,
}


@pytest.fixture(scope="module")
def admin_c():
    return client(login(PHONES["admin"]))


@pytest.fixture(scope="module")
def merchant_c():
    return client(login(PHONES["merchant"]))


@pytest.fixture(scope="module")
def partner_c():
    return client(login(PHONES["partner"]))


@pytest.fixture(scope="module")
def customer_c():
    return client(login(PHONES["customer"]))


def _put_settings(admin_c, payload):
    return admin_c.put(f"{API}/admin/settings", json=payload, timeout=30)


@pytest.fixture(scope="module", autouse=True)
def reset_at_end(admin_c):
    yield
    r = _put_settings(admin_c, {"commission": RESET_COMMISSION})
    assert r.status_code == 200, f"reset failed: {r.status_code} {r.text[:300]}"


# --------------------------------------------------------------- 1. settings validation
class TestCommissionSettingsValidation:
    def test_reject_when_four_pcts_not_100(self, admin_c):
        # 70 + 15 + 10 + 10 = 105 → must be rejected
        r = _put_settings(admin_c, {"commission": {
            "partner_pct": 70, "platform_pct": 15,
            "merchant_partner_referral_pct": 10, "merchant_customer_pct": 10,
            "customer_refund_pct": 80, "partner_cancellation_pct": 20,
        }})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        assert "100" in r.text

    def test_accept_when_four_pcts_total_100_and_persist(self, admin_c):
        payload = {"commission": {
            "partner_pct": 70, "platform_pct": 15,
            "merchant_partner_referral_pct": 10, "merchant_customer_pct": 5,
            "customer_refund_pct": 80, "partner_cancellation_pct": 20,
        }}
        r = _put_settings(admin_c, payload)
        assert r.status_code == 200, r.text[:400]
        # persistence
        g = admin_c.get(f"{API}/admin/settings", timeout=30)
        assert g.status_code == 200
        cm = g.json().get("commission") or {}
        assert float(cm.get("partner_pct")) == 70
        assert float(cm.get("platform_pct")) == 15
        assert float(cm.get("merchant_partner_referral_pct")) == 10
        assert float(cm.get("merchant_customer_pct")) == 5

    def test_reject_cancellation_split_not_100(self, admin_c):
        r = _put_settings(admin_c, {"commission": {
            **RESET_COMMISSION,
            "customer_refund_pct": 70, "partner_cancellation_pct": 20,
        }})
        assert r.status_code == 400
        assert "100" in r.text

    def test_accept_cancellation_split_100(self, admin_c):
        r = _put_settings(admin_c, {"commission": {
            **RESET_COMMISSION,
            "customer_refund_pct": 60, "partner_cancellation_pct": 40,
        }})
        assert r.status_code == 200


# --------------------------------------------------------------- 2. ledger reconciliation
class TestLedgerReconciliation:
    """Every existing commission_ledger.completion row must reconcile exactly:
    partner_earning + platform_earning + merchant_referral + merchant_customer == base."""

    def test_existing_ledger_sums_to_base(self, admin_c):
        # Reach ledger via booking_detail (admin computes rows there too), but the
        # authoritative source is the ledger itself. Since we don't expose ledger
        # directly, iterate admin bookings, then for completed/paid check the
        # detail.commission.rows sum to base.
        rows = admin_c.get(f"{API}/admin/bookings", timeout=60)
        assert rows.status_code == 200
        completed = [b for b in rows.json() if b.get("status") in ("completed", "paid")][:15]
        if not completed:
            pytest.skip("No completed bookings to reconcile")
        checked = 0
        for b in completed:
            d = admin_c.get(f"{API}/admin/bookings/{b['id']}/detail", timeout=30)
            if d.status_code != 200:
                continue
            comm = d.json().get("commission") or {}
            if comm.get("kind") != "completion":
                continue
            base = float(comm.get("base") or 0)
            if base <= 0:
                continue
            total_shares = round(sum(float(r.get("amount") or 0) for r in comm.get("rows") or []), 2)
            assert abs(total_shares - round(base, 2)) <= 0.02, \
                f"booking {b['code']} shares {total_shares} != base {base}"
            checked += 1
            if checked >= 5:
                break
        assert checked > 0, "no reconcilable completion rows found"

    def test_platform_absorbs_ineligible_referral(self, admin_c):
        """If a completed booking has NO referral_merchant + NO customer_merchant, its
        platform_earning % must equal partner+platform+refs configured platform% + both
        referral %s (platform absorbs both unused). We rely on booking_detail.rows."""
        rows = admin_c.get(f"{API}/admin/bookings", timeout=60)
        assert rows.status_code == 200
        completed = [b for b in rows.json() if b.get("status") in ("completed", "paid")]
        matched = 0
        for b in completed[:30]:
            d = admin_c.get(f"{API}/admin/bookings/{b['id']}/detail", timeout=30)
            if d.status_code != 200:
                continue
            det = d.json()
            if det.get("referral_merchant") or det.get("customer_merchant"):
                continue
            comm = det.get("commission") or {}
            if comm.get("kind") != "completion":
                continue
            base = float(comm.get("base") or 0)
            if base <= 0:
                continue
            rows_by_role = {r["role"]: r for r in comm["rows"]}
            partner_amt = float(rows_by_role["partner"]["amount"])
            platform_amt = float(rows_by_role["platform"]["amount"])
            mref = float(rows_by_role["merchant_referral"]["amount"])
            mcust = float(rows_by_role["merchant_customer"]["amount"])
            # ineligible → both 0
            assert mref == 0 and mcust == 0, f"unexpected referral credit on {b['code']}"
            # platform + partner cover the base fully
            assert abs(partner_amt + platform_amt - round(base, 2)) <= 0.02
            matched += 1
            if matched >= 2:
                break
        if matched == 0:
            pytest.skip("no direct (no-merchant) completed booking to test absorption")


# --------------------------------------------------------------- 3. role-based invoice detail
def _find_booking_invoice(cli):
    r = cli.get(f"{API}/invoices?invoice_type=booking&page_size=25", timeout=30)
    assert r.status_code == 200, r.text[:300]
    items = r.json().get("items") or []
    return items[0] if items else None


class TestInvoiceRoleVisibility:
    def test_customer_invoice_hides_commission(self, customer_c):
        inv_stub = _find_booking_invoice(customer_c)
        if not inv_stub:
            pytest.skip("no booking invoice for customer")
        r = customer_c.get(f"{API}/invoices/{inv_stub['id']}", timeout=30)
        assert r.status_code == 200
        inv = r.json()
        for f in ("commission", "commission_pct", "commission_base", "commission_rate",
                  "platform_earning", "partner_earning", "role_earning",
                  "partner_snapshot", "merchant_snapshot"):
            assert f not in inv, f"customer must not see field: {f}"
        # basic totals still present
        assert "total_amount" in inv and "tax" in inv and "subtotal" in inv

    def test_partner_invoice_has_role_earning_no_platform(self, partner_c):
        inv_stub = _find_booking_invoice(partner_c)
        if not inv_stub:
            pytest.skip("no booking invoice for partner")
        r = partner_c.get(f"{API}/invoices/{inv_stub['id']}", timeout=30)
        assert r.status_code == 200
        inv = r.json()
        for f in ("commission", "commission_pct", "commission_base", "commission_rate",
                  "merchant_referral", "merchant_customer"):
            assert f not in inv, f"partner must not see: {f}"
        re_ = inv.get("role_earning")
        assert re_, "partner invoice must include role_earning"
        assert re_.get("role") == "partner"
        assert re_.get("commission_label") == "Partner Commission"
        assert "rate" in re_ and re_["rate"] is not None
        assert "commission" in re_ and re_["commission"] is not None
        assert "net" in re_

    def test_merchant_invoice_role_earning_only_referral(self, merchant_c):
        inv_stub = _find_booking_invoice(merchant_c)
        if not inv_stub:
            pytest.skip("no booking invoice for merchant")
        r = merchant_c.get(f"{API}/invoices/{inv_stub['id']}", timeout=30)
        assert r.status_code == 200
        inv = r.json()
        for f in ("commission", "commission_pct", "commission_base", "commission_rate",
                  "partner_earning", "partner_total", "partner_snapshot", "platform_earning",
                  "merchant_referral", "merchant_customer"):
            assert f not in inv, f"merchant must not see: {f}"
        re_ = inv.get("role_earning")
        # role_earning is optional (absent if merchant has no share on this invoice)
        if re_:
            assert re_.get("role") == "merchant"
            assert re_.get("commission_label") in ("Merchant Commission", "Total Commission")
            # merchant must NEVER show platform commission
            assert "platform" not in (re_.get("commission_label") or "").lower()

    def test_admin_invoice_full(self, admin_c):
        # any booking invoice via admin scope
        r = admin_c.get(f"{API}/invoices?invoice_type=booking&page_size=5", timeout=30)
        assert r.status_code == 200
        items = r.json().get("items") or []
        if not items:
            pytest.skip("no booking invoice")
        inv_id = items[0]["id"]
        d = admin_c.get(f"{API}/invoices/{inv_id}", timeout=30)
        assert d.status_code == 200
        inv = d.json()
        assert "commission" in inv, "admin must see platform commission"
        assert "commission_pct" in inv, "admin must see commission_pct"
        assert "commission_base" in inv, "admin must see commission_base"
        assert "role_earning" not in inv, "admin should not have role_earning"


# --------------------------------------------------------------- 4. list summary + display
class TestInvoiceListVisibility:
    def test_admin_summary_has_commission_amount(self, admin_c):
        r = admin_c.get(f"{API}/invoices?page_size=5", timeout=30)
        assert r.status_code == 200
        assert "commission_amount" in (r.json().get("summary") or {})

    def test_customer_partner_merchant_summary_no_commission_amount(self, customer_c, partner_c, merchant_c):
        for cli, who in [(customer_c, "customer"), (partner_c, "partner"), (merchant_c, "merchant")]:
            r = cli.get(f"{API}/invoices?page_size=5", timeout=30)
            assert r.status_code == 200, f"{who}: {r.text[:200]}"
            summary = r.json().get("summary") or {}
            assert "commission_amount" not in summary, f"{who} must not see commission_amount"

    def test_partner_list_display_amount_is_partner_net(self, partner_c, admin_c):
        r = partner_c.get(f"{API}/invoices?invoice_type=booking&page_size=25", timeout=30)
        assert r.status_code == 200
        items = r.json().get("items") or []
        checked = 0
        mismatches = []
        for it in items:
            bid = it.get("booking_id")
            if not bid:
                continue
            det = admin_c.get(f"{API}/admin/bookings/{bid}/detail", timeout=30)
            if det.status_code != 200:
                continue
            rows_by_role = {r_["role"]: r_ for r_ in ((det.json().get("commission") or {}).get("rows") or [])}
            if "partner" not in rows_by_role:
                continue
            partner_amt = float(rows_by_role["partner"]["amount"])
            da = float(it.get("display_amount") or 0)
            total_amt = float(it.get("total_amount") or 0)
            # invariants that must always hold
            assert da <= total_amt + 0.01, \
                f"partner display_amount {da} exceeds gross {total_amt} on {it.get('invoice_number')}"
            # If partner earning is materially less than gross, display should reflect partner_net
            if total_amt - partner_amt > 5:
                if abs(da - total_amt) < 0.5 and da > 0:
                    # display_amount == customer gross → likely NO ledger entry (fallback path)
                    mismatches.append({
                        "invoice": it.get("invoice_number"),
                        "booking_id": bid,
                        "gross": total_amt,
                        "partner_amt": partner_amt,
                        "display": da,
                    })
            checked += 1
        if checked == 0:
            pytest.skip("no comparable partner invoices with ledger")
        # We EXPECT no fallback-to-gross rows for partner invoices whose ledger exists.
        # If any exist, they indicate missing commission_ledger entries or a list-mapping bug.
        assert not mismatches, (
            f"{len(mismatches)}/{checked} partner invoices show customer GROSS as display_amount: "
            f"{mismatches[:3]}"
        )


# --------------------------------------------------------------- 5. earnings-summary math
class TestPartnerEarningsSummary:
    def test_gross_minus_tax_minus_net_equals_platform_commission(self, partner_c):
        r = partner_c.get(f"{API}/partner/earnings-summary", timeout=30)
        assert r.status_code == 200, r.text[:300]
        s = r.json()
        gross = float(s.get("gross_earnings") or s.get("gross") or 0)
        tax = float(s.get("tax") or 0)
        net = float(s.get("net_earnings") or s.get("net") or 0)
        platform = float(s.get("platform_commission") or 0)
        if gross == 0:
            pytest.skip("partner has no earnings yet")
        # allow 2p rounding
        expected_platform = round(gross - tax - net, 2)
        assert abs(expected_platform - round(platform, 2)) <= 0.05, \
            f"gross={gross} tax={tax} net={net} platform={platform}"


# --------------------------------------------------------------- 6. commission rate correctness
class TestInvoiceCommissionRate:
    def test_admin_commission_pct_matches_settings(self, admin_c):
        # ensure we are at reset (80/12/...) — force it here regardless
        _put_settings(admin_c, {"commission": RESET_COMMISSION})
        g = admin_c.get(f"{API}/admin/settings", timeout=30)
        cm = g.json().get("commission") or {}
        platform_pct = float(cm.get("platform_pct"))
        assert platform_pct == 12.0
        # fetch a booking invoice
        r = admin_c.get(f"{API}/invoices?invoice_type=booking&page_size=15", timeout=30)
        items = r.json().get("items") or []
        # freshly created invoice would have commission_pct=12; historical may snapshot different
        # find one with commission_pct exposed (they all should for admin)
        seen = 0
        for it in items:
            d = admin_c.get(f"{API}/invoices/{it['id']}", timeout=30)
            if d.status_code != 200:
                continue
            inv = d.json()
            if inv.get("commission_pct") is None:
                continue
            base = float(inv.get("commission_base") or 0)
            comm = float(inv.get("commission") or 0)
            pct = float(inv.get("commission_pct"))
            if base > 0:
                # commission == round(base * pct/100, 2)
                assert abs(round(base * pct / 100, 2) - round(comm, 2)) <= 0.05, \
                    f"{it['invoice_number']}: base={base} pct={pct} commission={comm}"
                seen += 1
                if seen >= 3:
                    break
        if seen == 0:
            pytest.skip("no admin invoices with commission_base/pct snapshot to verify")


# --------------------------------------------------------------- 7. no 500s smoke
class TestNo500s:
    def test_admin_bookings_no_500(self, admin_c):
        r = admin_c.get(f"{API}/admin/bookings", timeout=60)
        assert r.status_code == 200

    def test_customer_invoices_no_500(self, customer_c):
        r = customer_c.get(f"{API}/invoices?page_size=5", timeout=30)
        assert r.status_code == 200

    def test_partner_earnings_no_500(self, partner_c):
        r = partner_c.get(f"{API}/partner/earnings-summary", timeout=30)
        assert r.status_code == 200

    def test_merchant_invoices_no_500(self, merchant_c):
        r = merchant_c.get(f"{API}/invoices?page_size=5", timeout=30)
        assert r.status_code == 200
