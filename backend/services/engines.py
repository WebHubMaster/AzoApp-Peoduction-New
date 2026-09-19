"""Core business engines: Pricing, Commission, Referral, Matching.
Kept separate from booking logic so admin-configurable rules never get hard-coded."""
from config.database import db, now_iso, get_settings
from models.user import new_id
from services import money
from datetime import datetime, timezone, timedelta

# India Standard Time offset — surge peak windows are evaluated in IST.
_IST = timezone(timedelta(hours=5, minutes=30))
_WD = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def normalize_addons(raw):
    """Canonical add-on shape → list of {name, qty}.

    Accepts EITHER a legacy list of names (['MCB Replace']) — each defaulting to
    qty 1 — OR a list of dicts ([{'name': 'MCB Replace', 'qty': 2}]). This is the
    single place add-on quantity is interpreted so the customer's independent
    add-on quantity is never multiplied by the main service quantity."""
    out = []
    for a in raw or []:
        if isinstance(a, str):
            if a.strip():
                out.append({"name": a, "qty": 1})
        elif isinstance(a, dict) and a.get("name"):
            try:
                q = max(1, int(a.get("qty", 1) or 1))
            except (TypeError, ValueError):
                q = 1
            out.append({"name": a.get("name"), "qty": q})
    return out


class PricingEngine:
    @staticmethod
    async def _active_surge_rules():
        """All active surge rules. Reads the admin-managed `surge_rules` collection
        AND legacy `pricing_rules` (older seeds) so both keep working."""
        rules = await db.surge_rules.find({"status": {"$ne": "inactive"}}, {"_id": 0}).to_list(200)
        rules = [r for r in rules if str(r.get("status", "active")).lower() == "active"]
        legacy = await db.pricing_rules.find({"status": "active"}, {"_id": 0}).to_list(200)
        return rules + legacy

    @staticmethod
    def _rule_active_now(r):
        """Optional peak window support: a rule may define start_hour/end_hour (0-23,
        IST) and/or days (list like ['sat','sun'] or 'sat,sun'). Blank => always on."""
        now = datetime.now(_IST)
        days = r.get("days") or r.get("active_days")
        if days:
            if isinstance(days, str):
                days = [d for d in days.replace(" ", "").split(",") if d]
            wanted = {str(d).strip().lower()[:3] for d in days}
            if wanted and _WD[now.weekday()] not in wanted:
                return False
        try:
            sh = int(r.get("start_hour")) if str(r.get("start_hour", "")).strip() != "" else None
            eh = int(r.get("end_hour")) if str(r.get("end_hour", "")).strip() != "" else None
        except (TypeError, ValueError):
            sh = eh = None
        if sh is not None and eh is not None and not (sh == 0 and eh == 0):
            h = now.hour
            if sh <= eh:
                if not (sh <= h < eh):
                    return False
            elif not (h >= sh or h < eh):  # overnight window, e.g. 22:00 → 06:00
                return False
        return True

    @staticmethod
    async def _surge(service: dict, address: dict, subtotal: float) -> tuple:
        """Sum every active surge rule that matches this service + address (and is
        inside its peak window). Supports percentage / fixed ₹ / multiplier (×)."""
        rules = await PricingEngine._active_surge_rules()
        city = (address or {}).get("city", "").strip().lower()
        pin = str((address or {}).get("pincode", "")).strip()
        svc_cat = str(service.get("category_name", "")).strip().lower()
        amt, applied = 0.0, []
        for r in rules:
            scope = (r.get("scope") or "all").strip().lower()
            mv = str(r.get("match_value", "")).strip().lower()
            cat = r.get("service_category")
            if cat:
                if isinstance(cat, list):
                    cats = [str(x).strip().lower() for x in cat if str(x).strip()]
                    if cats and svc_cat not in cats:
                        continue
                elif str(cat).strip().lower() != svc_cat:
                    continue
            if scope == "city" and mv != city:
                continue
            if scope == "pincode" and mv != pin:
                continue
            if scope == "category" and mv and mv != svc_cat:
                continue
            if not PricingEngine._rule_active_now(r):
                continue
            st = (r.get("surge_type") or "percentage").strip().lower()
            val = float(r.get("surge_value", 0) or 0)
            if st == "fixed":
                amt = money.add(amt, val)
            elif st == "multiplier":
                amt = money.add(amt, money.money(subtotal * max(0.0, val - 1.0)))  # 1.5× ⇒ +50%
            else:  # percentage
                amt = money.add(amt, money.pct(subtotal, val))
            if r.get("name"):
                applied.append(r["name"])
        # Dynamic AUTO-SURGE (supply vs demand) — admin-toggleable.
        auto_amt, auto_name = await PricingEngine._auto_surge(address, subtotal)
        if auto_amt > 0:
            amt = money.add(amt, auto_amt)
            applied.append(auto_name)
        return money.money(amt), (", ".join(applied) if applied else None)

    @staticmethod
    async def auto_surge_pct(city: str) -> tuple:
        """Live auto-surge % for a city based on demand (active jobs) vs supply
        (online partners). Returns (pct, reason). 0 if disabled or supply is fine."""
        settings = await get_settings()
        biz = settings.get("business_config", {}) or {}
        if not biz.get("auto_surge_enabled"):
            return 0.0, None
        max_pct = float(biz.get("auto_surge_max_pct", 30) or 30)
        threshold = float(biz.get("auto_surge_threshold", 1.0) or 1.0)  # jobs per online partner
        c = (city or "").strip()
        if not c:
            return 0.0, None
        rx = {"$regex": f"^{c}$", "$options": "i"}
        online = await db.users.count_documents({"role": "partner", "partner_status": "online", "city": rx})
        demand = await db.bookings.count_documents({
            "address.city": rx,
            "status": {"$in": ["searching", "assigned", "arrived_shop", "arrived_customer", "started"]}})
        if demand <= 0:
            return 0.0, None
        if online <= 0:
            return round(max_pct, 2), "Auto surge (no partners online)"
        load = demand / online
        if load <= threshold:
            return 0.0, None
        pct = min(max_pct, round(max_pct * (load - threshold) / threshold, 2))
        return (round(pct, 2), f"Auto surge (high demand ×{round(load, 1)})") if pct > 0 else (0.0, None)

    @staticmethod
    async def _auto_surge(address: dict, subtotal: float) -> tuple:
        pct, reason = await PricingEngine.auto_surge_pct((address or {}).get("city", ""))
        if pct <= 0:
            return 0.0, None
        return money.pct(subtotal, pct), reason

    @staticmethod
    async def compute(service: dict, settings: dict, schedule_type: str,
                      addon_names: list, coupon: dict = None, address: dict = None,
                      cart_service_total: float = None, apply_visiting: bool = True,
                      apply_emergency: bool = True) -> dict:
        base = float(service.get("base_price", 0))
        # Add-on quantity is INDEPENDENT of the main service quantity. Each selected
        # add-on carries its own qty (default 1); the price is add-on price × add-on
        # qty — it is NEVER multiplied by the main service quantity.
        addon_qty = {a["name"]: a["qty"] for a in normalize_addons(addon_names)}
        addon_total = 0.0
        for a in service.get("addons", []):
            if a.get("name") in addon_qty:
                addon_total = money.add(addon_total, float(a.get("price", 0)) * addon_qty[a["name"]])
        # Instant/Emergency fee is a per-ORDER charge — for a multi-item cart it must be
        # added exactly ONCE (on the first booking). `apply_emergency=False` on the
        # remaining lines prevents it from being multiplied per service.
        emergency_fee = (float(settings["emergency_fee"])
                         if (schedule_type == "emergency" and apply_emergency) else 0.0)
        service_value = money.add(base, addon_total)
        surge, surge_rule = await PricingEngine._surge(service, address, service_value)
        # Booking-fee rules live in Business Settings (business_config).
        biz = settings.get("business_config", {}) or {}
        # Global Visiting Charge — applied ONLY when the *cart total* service amount is
        # below the configured minimum (small orders pay a visiting charge). For a
        # standalone single-service quote, cart_service_total falls back to this
        # service's own value. `apply_visiting` lets a multi-item cart add the charge
        # exactly once (on the first line) instead of once per line. If no minimum is
        # set (0), the visiting charge applies whenever it is enabled.
        visiting_charge = 0.0
        vc_amount = float(biz.get("global_visiting_charge", 0) or 0)
        vc_min = float(biz.get("min_service_amount_for_visiting", 0) or 0)
        threshold = cart_service_total if cart_service_total is not None else service_value
        if apply_visiting and vc_amount > 0 and (vc_min <= 0 or threshold < vc_min):
            visiting_charge = vc_amount
        subtotal = money.add(service_value, emergency_fee, surge, visiting_charge)
        # Convenience & Platform fees apply only when enabled in Business Settings.
        convenience_fee = 0.0
        if biz.get("apply_convenience_fee"):
            convenience_fee = money.pct(subtotal, biz.get("convenience_fee_pct", 0) or 0)
        platform_fee = 0.0
        if biz.get("apply_platform_fee") and apply_visiting:
            platform_fee = float(biz.get("platform_fee", 0) or 0)
        gross = money.add(subtotal, convenience_fee, platform_fee)
        discount = PricingEngine.coupon_discount(coupon, gross, visiting_charge)
        pricing = {
            "base": base, "addons_total": addon_total, "emergency_fee": emergency_fee,
            "surge": surge, "surge_rule": surge_rule, "visiting_charge": visiting_charge,
            "subtotal": subtotal, "convenience_fee": convenience_fee,
            "platform_fee": platform_fee, "discount": discount,
        }
        return PricingEngine.finalize(pricing, settings["gst_pct"])

    @staticmethod
    def coupon_discount(coupon: dict, gross_charges: float, visiting_charge: float) -> float:
        """Coupon discount on the FULL pre-tax charges (service + every fee)."""
        if not coupon:
            return 0.0
        dt = coupon.get("discount_type")
        if dt == "percentage":
            discount = money.pct(gross_charges, coupon.get("discount_value", 0) or 0)
            if coupon.get("max_discount"):
                discount = min(discount, float(coupon["max_discount"]))
        elif dt == "free_visiting":
            discount = float(visiting_charge or 0)
        else:
            discount = float(coupon.get("discount_value", 0) or 0)
        return money.money(max(0.0, min(discount, gross_charges)))

    DISCOUNT_KEYS = ("discount", "membership_discount", "membership_visit_waiver",
                     "loyalty_discount", "referral_discount")

    @staticmethod
    def paid_excl_tax(pricing: dict) -> float:
        """Amount the customer pays EXCLUDING tax = the commission base. Derived from the
        stored total − GST so legacy bookings (pre-`taxable`) resolve to the same rule."""
        pricing = pricing or {}
        gst = money.money(pricing.get("gst") or pricing.get("tax") or 0)
        total = money.money(pricing.get("total") or 0)
        if total > 0:
            return max(0.0, money.add(total, -min(gst, total)))
        for k in ("taxable", "commissionable_base", "subtotal", "base"):
            if pricing.get(k) is not None:
                return money.money(pricing.get(k) or 0)
        return 0.0

    @staticmethod
    def commission_base_excl_tax(pricing: dict) -> float:
        """Commission base for the partner/merchant split (tax-EXCLUDED).

        The COUPON discount (`pricing['discount']`) is ADDED BACK so the partner earns on
        the full pre-coupon service amount: the customer still gets the coupon discount,
        but the platform absorbs it while the partner receives the same amount as if no
        coupon were used. Membership/loyalty/referral discounts stay deducted.

        Convenience Fee & Platform Fee are 100% AzoApp PLATFORM revenue — they are
        EXCLUDED here so they are NEVER part of the partner/merchant commissionable base
        (i.e. partner/merchant payout never includes these platform-only charges)."""
        base = PricingEngine.paid_excl_tax(pricing)
        coupon = money.money((pricing or {}).get("discount") or 0)
        platform_only = PricingEngine.platform_only_fees(pricing)
        return money.money(max(0.0, money.add(base, coupon, -platform_only)))

    @staticmethod
    def platform_only_fees(pricing: dict) -> float:
        """Sum of the platform-only customer charges (Convenience + Platform fee). These
        belong 100% to the AzoApp platform and are excluded from every partner/merchant
        payout, commission base and provider-facing document."""
        pricing = pricing or {}
        return money.add(money.money(pricing.get("convenience_fee") or 0),
                         money.money(pricing.get("platform_fee") or 0))

    @staticmethod
    def finalize(pricing: dict, gst_pct) -> dict:
        """Single source of truth for the customer bill (mutates + returns `pricing`):
          gross_charges  = service + add-ons + emergency + surge + visiting + convenience + platform fee
          taxable        = gross_charges − ALL discounts (coupon/membership/loyalty/referral)
          gst            = taxable × gst%          (tax only on what the customer actually pays)
          total          = taxable + gst
          commissionable_base = taxable            (commission is split on the tax-excluded amount)
        Discounts are capped so they can never exceed the charges."""
        charges = money.add(pricing.get("base", 0), pricing.get("addons_total", 0),
                            pricing.get("emergency_fee", 0), pricing.get("surge", 0),
                            pricing.get("visiting_charge", 0), pricing.get("convenience_fee", 0),
                            pricing.get("platform_fee", 0))
        remaining = charges
        for k in PricingEngine.DISCOUNT_KEYS:
            if k not in pricing:
                continue
            v = money.money(pricing.get(k) or 0)
            v = min(v, remaining) if v > 0 else 0.0
            pricing[k] = v
            remaining = money.add(remaining, -v)
        taxable = money.money(remaining)
        gst = money.pct(taxable, gst_pct)
        # commissionable_base = the SERVICE-side taxable amount the partner/merchant split
        # is computed on. Convenience & Platform fees are 100% platform revenue, so they
        # are removed from this base (they never reach partner/merchant payout).
        platform_only = money.add(money.money(pricing.get("convenience_fee") or 0),
                                  money.money(pricing.get("platform_fee") or 0))
        commissionable_base = money.money(max(0.0, money.add(taxable, -platform_only)))
        pricing.update({
            "gross_charges": charges, "total_discount": money.add(charges, -taxable),
            "taxable": taxable, "gst_pct": float(gst_pct or 0), "gst": gst, "tax": gst,
            "total": money.add(taxable, gst), "commissionable_base": commissionable_base,
            "platform_only_fees": platform_only,
        })
        return pricing

    # ------------------------------------------------------------------ breakdown
    # Labels for every possible non-service charge. Kept in one place so Customer,
    # Partner, Merchant, Admin panels AND invoices all use identical wording/order.
    CHARGE_LABELS = [
        ("emergency_fee", "Emergency Fee"),
        ("surge", "Surge Charge"),
        ("visiting_charge", "Visiting Charge"),
        ("convenience_fee", "Convenience Fee"),
        ("platform_fee", "Platform Fee"),
    ]

    @staticmethod
    def build_breakdown(booking: dict, settings: dict = None, audience: str = "customer") -> dict:
        """SINGLE SOURCE OF TRUTH for the customer-facing financial breakdown.

        Returns a fully structured, ready-to-render breakdown so NO panel ever
        re-derives amounts locally (which caused the "Service Amount ₹749 already
        included the ₹150 Emergency Fee, then showed Emergency Fee ₹150 again"
        duplication). Every service is itemised as Qty × Rate = Amount, each add-on
        keeps its OWN independent quantity, and every additional charge is a separate
        line — the pure service amount NEVER absorbs a fee.

        The breakdown reconciles by construction:
          services_subtotal + Σ additional_charges = subtotal (= gross_charges)
          taxable = subtotal − discount ;  tax = taxable × gst%
          total   = taxable + tax
        """
        pr = booking.get("pricing") or {}

        def r2(x):
            return money.money(float(x or 0))

        # ---- additional charges (each once, never merged into service amount) ----
        additional = []
        for key, label in PricingEngine.CHARGE_LABELS:
            amt = r2(pr.get(key))
            if amt > 0:
                extra = {"key": key, "label": label, "amount": amt}
                if key == "surge" and pr.get("surge_rule"):
                    extra["note"] = pr.get("surge_rule")
                additional.append(extra)
        charges_total = money.add(*[c["amount"] for c in additional]) if additional else 0.0

        # ---- authoritative subtotal / services subtotal (reconciles) ----
        subtotal = r2(pr.get("gross_charges"))
        if subtotal <= 0:
            # legacy bookings without gross_charges: rebuild from parts
            subtotal = money.add(r2(pr.get("subtotal")), r2(pr.get("convenience_fee")),
                                 r2(pr.get("platform_fee")))
        services_subtotal = money.add(subtotal, -charges_total)
        if services_subtotal < 0:
            services_subtotal = 0.0

        # ---- service line items (Qty × Rate = Amount), add-ons independent qty ----
        service_items = []
        b_items = booking.get("items") or []
        if b_items:
            for it in b_items:
                qty = max(1, int(it.get("qty", 1) or 1))
                addons = normalize_addons(it.get("addons") or [])
                # normalize_addons drops price; re-read price from the raw add-on dicts
                raw_addons = {a.get("name"): a for a in (it.get("addons") or []) if isinstance(a, dict)}
                base_unit = it.get("base_price")
                if base_unit is None:
                    base_unit = float(it.get("unit_service_value") or 0) - sum(
                        float((raw_addons.get(a["name"]) or {}).get("price") or 0) * a["qty"] for a in addons)
                rate = r2(base_unit)
                addon_lines = []
                for a in addons:
                    ar = r2((raw_addons.get(a["name"]) or {}).get("price"))
                    addon_lines.append({"name": a["name"], "qty": a["qty"], "rate": ar,
                                        "amount": money.money(ar * a["qty"])})
                service_items.append({
                    "name": it.get("service_name") or it.get("name") or it.get("custom_name") or "Service",
                    "category": it.get("category_name") or booking.get("category_name") or "",
                    "qty": qty, "rate": rate, "amount": money.money(rate * qty),
                    "addons": addon_lines,
                })
        else:
            base = r2(pr.get("base"))
            addon_lines = []
            raw = booking.get("addons") or []
            priced = [a for a in raw if isinstance(a, dict) and (a.get("price") or a.get("amount"))]
            if priced:
                for a in normalize_addons(raw):
                    src = next((x for x in raw if isinstance(x, dict) and x.get("name") == a["name"]), {})
                    ar = r2(src.get("price") or src.get("amount"))
                    addon_lines.append({"name": a["name"], "qty": a["qty"], "rate": ar,
                                        "amount": money.money(ar * a["qty"])})
            elif r2(pr.get("addons_total")) > 0:
                # no per-add-on price stored → single aggregate add-on line
                addon_lines.append({"name": "Add-ons", "qty": 1, "rate": r2(pr.get("addons_total")),
                                    "amount": r2(pr.get("addons_total"))})
            service_items.append({
                "name": booking.get("service_name") or "Service",
                "category": booking.get("category_name") or "",
                "qty": 1, "rate": base, "amount": base, "addons": addon_lines,
            })

        # ---- discount / tax / totals (all from stored authoritative pricing) ----
        coupon_discount = r2(pr.get("discount"))
        total_discount = r2(pr.get("total_discount")) if pr.get("total_discount") is not None else coupon_discount
        taxable = r2(pr.get("taxable")) if pr.get("taxable") is not None else money.add(subtotal, -total_discount)
        tax = r2(pr.get("gst") if pr.get("gst") is not None else pr.get("tax"))
        gst_pct = float(pr.get("gst_pct") or (settings or {}).get("gst_pct") or 0)
        total = r2(pr.get("total")) if pr.get("total") is not None else money.add(taxable, tax)

        # ---- payment / refund ----
        pay_status = booking.get("payment_status") or "pending"
        paid = total if pay_status in ("paid", "completed", "refunded") else 0.0
        canc = booking.get("cancellation") or {}
        refund = None
        if canc:
            original = r2(canc.get("original_amount")) or total
            ref_amt = r2(canc.get("refund"))
            refund = {
                "original_amount": original,
                "refund_pct": (float(canc.get("refund_pct")) if canc.get("refund_pct") is not None else None),
                "refund_amount": ref_amt,
                "retained": money.add(original, -ref_amt),
            }

        result = {
            "service_items": service_items,
            "services_subtotal": money.money(services_subtotal),
            "additional_charges": additional,
            "charges_total": money.money(charges_total),
            "subtotal": money.money(subtotal),
            "coupon_discount": coupon_discount,
            "discount": total_discount,
            "coupon_code": booking.get("coupon_code"),
            "taxable": taxable,
            "gst_pct": gst_pct,
            "tax": tax,
            "total": total,
            "paid": money.money(paid),
            "payment_status": pay_status,
            "refund": refund,
            "currency": (settings or {}).get("currency") or "INR",
        }
        # Partner/Merchant: platform-only fees are removed from the SERVICE-side totals
        # (subtotal/taxable/tax/total) so the provider document reconciles WITHOUT them,
        # but they are NOT hidden — they are surfaced as `customer_only_charges` (flagged
        # excluded) alongside the partner-eligible subtotal + the earning split, so the
        # partner can see exactly what the customer paid and why it differs from earnings.
        if audience in ("partner", "merchant"):
            stripped = PricingEngine.strip_platform_fees_breakdown(result)
            stripped.update(PricingEngine._partner_financials(booking, settings or {}, result))
            return stripped
        return result

    @staticmethod
    def _partner_financials(booking: dict, settings: dict, customer_bd: dict) -> dict:
        """Partner-oriented financial layer derived from the SAME customer breakdown /
        pricing object — NEVER a parallel calculation. Provides:
          • partner_eligible_subtotal — the tax-excluded base the split is computed on
            (service + add-ons + emergency/surge/visiting; coupon added back so an
            AzoApp-funded coupon never reduces partner earnings — per business rule)
          • customer_only_charges[]  — Convenience/Platform fee (100% platform), SHOWN
            to the partner but flagged `partner_excluded` so it is transparent
          • customer_paid_total      — the FULL amount the customer paid (incl. platform
            fee + tax) so the partner sees the real invoice, not a stripped one
          • earning{}                — share %, partner earning, platform earning, net,
            all from the admin-configured commission split (no hardcoding)."""
        pr = booking.get("pricing") or {}

        def r2(x):
            return money.money(float(x or 0))

        customer_only = []
        for key, label in (("convenience_fee", "Convenience Fee"), ("platform_fee", "Platform Fee")):
            amt = r2(pr.get(key))
            if amt > 0:
                customer_only.append({
                    "key": key, "label": label, "amount": amt, "partner_excluded": True,
                    "note": "Customer-only charge \u00b7 excluded from your earnings",
                })
        base = PricingEngine.commission_base_excl_tax(pr)
        split = CommissionEngine.compute_split(booking, settings or {})
        partner_pct = float((split.get("rates") or {}).get("partner_pct") or 0)
        partner_earning = r2(split.get("partner_earning"))
        platform_share_pct = round(max(0.0, 100.0 - partner_pct), 2)
        platform_earning = money.money(max(0.0, money.add(base, -partner_earning)))
        customer_paid_total = r2(pr.get("total")) or r2(customer_bd.get("total"))
        return {
            "partner_eligible_subtotal": base,
            "customer_only_charges": customer_only,
            "customer_paid_total": customer_paid_total,
            "earning": {
                "base": base,
                "partner_share_pct": partner_pct,
                "partner_earning": partner_earning,
                "platform_share_pct": platform_share_pct,
                "platform_earning": platform_earning,
                "net_earning": partner_earning,
            },
        }

    @staticmethod
    def strip_platform_fees_breakdown(bd: dict) -> dict:
        """Return a PROVIDER-facing (partner/merchant) copy of a customer breakdown with
        the platform-only fees (Convenience Fee + Platform Fee) removed and the
        subtotal/taxable/tax/total re-derived on the service side so the document still
        reconciles. Partners/merchants must NEVER see these 100%-platform charges."""
        if not bd:
            return bd
        bd = dict(bd)
        add = bd.get("additional_charges") or []
        removed = money.add(*[money.money(c.get("amount") or 0) for c in add
                              if c.get("key") in ("convenience_fee", "platform_fee")]) if add else 0.0
        if removed <= 0:
            return bd
        new_add = [c for c in add if c.get("key") not in ("convenience_fee", "platform_fee")]
        gst_pct = float(bd.get("gst_pct") or 0)
        new_subtotal = money.money(max(0.0, money.add(bd.get("subtotal", 0), -removed)))
        new_taxable = money.money(max(0.0, money.add(bd.get("taxable", 0), -removed)))
        new_tax = money.pct(new_taxable, gst_pct)
        new_total = money.add(new_taxable, new_tax)
        bd["additional_charges"] = new_add
        bd["charges_total"] = money.add(*[money.money(c.get("amount") or 0) for c in new_add]) if new_add else 0.0
        bd["subtotal"] = new_subtotal
        bd["taxable"] = new_taxable
        bd["tax"] = new_tax
        bd["total"] = new_total
        if bd.get("payment_status") in ("paid", "completed", "refunded"):
            bd["paid"] = new_total
        return bd


class CommissionEngine:
    """Splits money on job completion and writes an immutable ledger entry.

    New model (admin-configurable via settings.commission, all % of SERVICE COST which
    excludes GST):
      • partner_earning        = base × partner_pct
      • merchant_referral       = base × merchant_partner_referral_pct  (only if the partner
                                  was referred/onboarded by a merchant)
      • merchant_customer       = base × merchant_customer_pct          (only if the customer
                                  booked THROUGH a merchant — booking.merchant_id)
      • platform_earning        = base − partner − merchant_referral − merchant_customer
    Because the four configured %s total 100, platform automatically absorbs any commission
    a merchant is ineligible for (fallback rule) and the whole service cost is distributed
    with nothing left over."""

    @staticmethod
    def _cm(cfg: dict) -> dict:
        """Resolve the canonical commission block from a versioned config or settings,
        falling back to legacy flat keys so older bookings still settle correctly."""
        cm = cfg.get("commission") if isinstance(cfg, dict) else None
        if not cm:
            cm = {
                "platform_pct": float(cfg.get("platform_commission_pct", 32)),
                "partner_pct": float(cfg.get("partner_commission_pct", 60)),
                "merchant_partner_referral_pct": float(cfg.get("merchant_referral_pct", 5)),
                "merchant_customer_pct": float(cfg.get("merchant_booking_pct", 3)),
                "customer_refund_pct": float(cfg.get("customer_refund_pct", 80)),
                "partner_cancellation_pct": float(cfg.get("partner_cancellation_pct", 20)),
            }
        return cm

    @staticmethod
    def split(base, cm: dict, partner_merchant_id=None, customer_merchant_id=None) -> dict:
        """Pure 4-way split of a tax-EXCLUDED amount (the ONLY place the split math lives):
          1. partner_earning  = base × partner%
          2. platform_gross   = base − partner_earning            (everything else goes to platform)
          3. from platform_gross → merchant_referral (C%) if the partner came via a merchant,
                                 → merchant_customer (D%) if the customer came via a merchant
          4. platform_earning = platform_gross − merchant shares (platform keeps C/D when no merchant)
        Sum of the four payouts always equals `base` to the paisa."""
        base = money.money(base)
        partner_pct = float(cm.get("partner_pct", 60))
        platform_pct = float(cm.get("platform_pct", 32))
        mref_pct = float(cm.get("merchant_partner_referral_pct", 5))
        mcust_pct = float(cm.get("merchant_customer_pct", 3))
        partner_earning = money.pct(base, partner_pct)
        platform_gross = money.add(base, -partner_earning)
        merchant_referral = money.pct(base, mref_pct) if partner_merchant_id else 0.0
        merchant_customer = money.pct(base, mcust_pct) if customer_merchant_id else 0.0
        platform_earning = money.add(platform_gross, -merchant_referral, -merchant_customer)
        if platform_earning < 0:
            platform_earning = 0.0
        return {
            "base": base, "partner_earning": partner_earning, "platform_gross": platform_gross,
            "merchant_referral": merchant_referral, "referral_merchant_id": partner_merchant_id or None,
            "merchant_customer": merchant_customer, "customer_merchant_id": customer_merchant_id or None,
            "platform_earning": platform_earning,
            "distributed": money.add(partner_earning, merchant_referral, merchant_customer, platform_earning),
            "rates": {"partner_pct": partner_pct, "platform_pct": platform_pct,
                      "merchant_partner_referral_pct": mref_pct, "merchant_customer_pct": mcust_pct},
        }

    @staticmethod
    def compute_split(booking: dict, settings: dict, partner: dict = None) -> dict:
        """Pure (no DB write) commission split — mirrors settle() exactly."""
        cm = CommissionEngine._cm(booking.get("commission_config") or settings)
        pricing = booking.get("pricing") or {}
        s = CommissionEngine.split(PricingEngine.commission_base_excl_tax(pricing), cm,
                                   (partner or {}).get("referred_by_merchant"), booking.get("merchant_id"))
        pf = PricingEngine.platform_only_fees(pricing)
        s.update({"visiting_charge": 0.0, "partner_total": s["partner_earning"],
                  "platform_fees": pf, "platform_total": money.add(s["platform_earning"], pf),
                  "tax": money.money(pricing.get("tax") or pricing.get("gst") or 0)})
        return s

    @staticmethod
    async def settle(booking: dict, settings: dict, partner: dict) -> dict:
        cfg = booking.get("commission_config") or settings  # versioned: rate captured at booking time
        cm = CommissionEngine._cm(cfg)
        pricing = booking.get("pricing") or {}
        # Commission base = everything the customer paid EXCLUDING tax (service + add-ons +
        # visiting/emergency/surge/fees − all discounts). The visiting charge is part of
        # this base, so the partner receives only their configured % of it.
        s = CommissionEngine.split(PricingEngine.commission_base_excl_tax(pricing), cm,
                                   partner.get("referred_by_merchant"), booking.get("merchant_id"))
        partner_earning, platform_earning = s["partner_earning"], s["platform_earning"]
        merchant_referral, merchant_customer = s["merchant_referral"], s["merchant_customer"]
        partner_merchant_id, customer_merchant_id = s["referral_merchant_id"], s["customer_merchant_id"]

        ledger = {
            "id": new_id(), "booking_id": booking["id"], "booking_code": booking["code"],
            "partner_id": partner["id"], "customer_id": booking.get("customer_id"),
            "partner_earning": partner_earning,
            "visiting_charge": 0.0, "partner_total": partner_earning,
            "platform_gross": s["platform_gross"], "platform_earning": platform_earning,
            "merchant_referral": merchant_referral, "referral_merchant_id": partner_merchant_id,
            "merchant_customer": merchant_customer, "customer_merchant_id": customer_merchant_id,
            # legacy alias kept so existing readers keep working
            "merchant_booking": merchant_customer, "merchant_id": customer_merchant_id,
            "base": s["base"], "gross": float(pricing.get("total") or 0),
            "tax": money.money(pricing.get("tax") or pricing.get("gst") or 0),
            "platform_fees": PricingEngine.platform_only_fees(pricing),
            "platform_total": money.add(platform_earning, PricingEngine.platform_only_fees(pricing)),
            "rates": s["rates"], "kind": "completion", "created_at": now_iso(),
        }
        await db.commission_ledger.insert_one(dict(ledger))

        # credit wallets + transactions
        await CommissionEngine._credit(partner["id"], partner_earning, "earning",
                                       f"Job {booking['code']} earning")
        if merchant_referral and partner_merchant_id:
            await CommissionEngine._credit(partner_merchant_id, merchant_referral, "referral_commission",
                                           f"Partner referral commission · {booking['code']}")
        if merchant_customer and customer_merchant_id:
            await CommissionEngine._credit(customer_merchant_id, merchant_customer, "booking_commission",
                                           f"Customer booking commission · {booking['code']}")
        ledger.pop("_id", None)
        return ledger

    @staticmethod
    async def _credit(user_id: str, amount: float, kind: str, note: str):
        if amount <= 0:
            return
        await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
        await db.transactions.insert_one({
            "id": new_id(), "user_id": user_id, "amount": amount, "type": "credit",
            "kind": kind, "note": note, "created_at": now_iso(),
        })


class MatchingEngine:
    """Weighted-score partner matching (weights admin-configurable)."""

    @staticmethod
    def _coords(obj):
        """Best-effort extract (lat, lng) floats from a user/address dict."""
        if not isinstance(obj, dict):
            return None
        # live GPS first (where the partner IS right now), then location, then the
        # saved address, then flat keys (customer address dicts have only flat keys)
        for src in (obj.get("live_location"), obj.get("location"), obj.get("address"), obj):
            if isinstance(src, dict):
                lat = src.get("lat") if src.get("lat") is not None else src.get("latitude")
                lng = src.get("lng") if src.get("lng") is not None else src.get("longitude")
                try:
                    if lat is not None and lng is not None:
                        return (float(lat), float(lng))
                except (TypeError, ValueError):
                    continue
        return None

    @staticmethod
    def _haversine_km(a, b):
        """Great-circle distance in km between (lat,lng) tuples."""
        from math import radians, sin, cos, asin, sqrt
        lat1, lon1 = radians(a[0]), radians(a[1])
        lat2, lon2 = radians(b[0]), radians(b[1])
        dlat, dlon = lat2 - lat1, lon2 - lon1
        h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        return 2 * 6371.0 * asin(sqrt(h))

    @staticmethod
    async def eligible_partners(service: dict, settings: dict, address: dict = None) -> list:
        from services.partner_sync import skill_alias_map, skill_matches, active_zones, zone_for, partner_serves
        skill = (service.get("required_skill") or "").lower()
        amap = await skill_alias_map()
        zones = await active_zones()
        partners = await db.users.find(
            {"role": "partner", "kyc_status": "approved", "status": "active",
             "suspended": {"$ne": True},
             "availability": {"$nin": ["emergency", "leave"]}},
            {"_id": 0}).to_list(500)
        # partners on an active approved leave today are unavailable
        today = now_iso()[:10]
        on_leave = await db.partner_leaves.find(
            {"status": "approved", "start_date": {"$lte": today}, "end_date": {"$gte": today}},
            {"_id": 0, "partner_id": 1}).to_list(1000)
        leave_ids = {l["partner_id"] for l in on_leave}
        # partners who explicitly FAILED the assessment for this skill are gated out
        failed_ids = set()
        if skill:
            fails = await db.partner_skills.find(
                {"assessment_status": "failed"}, {"_id": 0, "partner_id": 1, "skill_name": 1}).to_list(2000)
            failed_ids = {f["partner_id"] for f in fails if skill_matches([f.get("skill_name")], skill, amap)}
        # admin-configured max serviceable distance (km). mile -> km if configured.
        bcfg = settings.get("business_config", {}) or {}
        max_km = bcfg.get("max_distance_km") or 15
        if bcfg.get("max_distance_km") and str(bcfg.get("distance_unit", "km")).startswith("mile"):
            max_km = float(max_km) * 1.60934
        cust_coords = MatchingEngine._coords(address) if address else None
        cust_zone = zone_for(zones, str((address or {}).get("pincode") or "").strip() or None,
                             cust_coords, (address or {}).get("city")) if address else None
        matched = []
        for p in partners:
            if p["id"] in leave_ids or p["id"] in failed_ids:
                continue
            # CATEGORY GATE (strict, alias-aware): the partner MUST have the service's
            # skill — stored either as the key ("electrical") or as the category
            # name/slug ("Electrician") captured at registration. An electrician never
            # gets an AC-repair job.
            if skill and not skill_matches(p.get("skills", []), skill, amap):
                continue
            # AREA GATE (realistic): per-partner service radius wins; else the global
            # admin max distance (default 15 km). pincode → same Service Area zone →
            # live GPS (partner without pincodes) → city. See partner_sync.partner_serves.
            limit_km = None
            if p.get("service_radius_km"):
                try:
                    limit_km = float(p.get("service_radius_km"))
                except (TypeError, ValueError):
                    limit_km = None
            if limit_km is None and max_km:
                limit_km = float(max_km)
            ok, dist_km, _reason = partner_serves(p, address or {}, limit_km, zones, cust_zone)
            if address and not ok:
                continue
            w = settings["matching_weights"]
            # closer partners score higher on the distance dimension
            dist_factor = 0.7
            if dist_km is not None and limit_km:
                dist_factor = max(0.0, 1 - (dist_km / float(limit_km)))
            score = (w["skill"] * 1
                     + w["rating"] * (float(p.get("rating", 5)) / 5)
                     + w["availability"] * (1 if p.get("partner_status") == "online" else 0.5)
                     + w["performance"] * min(p.get("jobs_completed", 0) / 50, 1)
                     + w["distance"] * dist_factor)
            # AzoApp Pro perk: premium (Starter-Kit) partners get a matching boost
            premium_boost = float(bcfg.get("premium_match_boost", 15) or 0)
            is_premium = bool(p.get("premium_partner"))
            if is_premium and premium_boost:
                score += premium_boost
            eta_min = None
            if dist_km is not None:
                # ~25 km/h effective city speed; min 3 min. Used to rank + show ETA.
                eta_min = max(3, round((dist_km / 25.0) * 60))
            matched.append({"id": p["id"], "name": p["name"], "score": round(score, 1),
                            "rating": p.get("rating", 5), "premium": is_premium,
                            "distance_km": round(dist_km, 1) if dist_km is not None else None,
                            "eta_min": eta_min})
        # PARTNER ETA RANKING (spec): the partner who can reach the customer FASTEST
        # goes first, so the closest pro is alerted at the front of wave 1. Partners
        # without known coordinates fall back to score order behind those with an ETA.
        matched.sort(key=lambda x: (
            x["distance_km"] if x["distance_km"] is not None else 1e9,
            -x["score"]))
        return matched

    @staticmethod
    async def available_targets(partner_ids: list) -> list:
        """From a capability+area eligible pool, return ONLY the partners we may
        push a job alert to RIGHT NOW: currently ONLINE, ACTIVE, approved, not
        suspended, and NOT BUSY on another in-progress job. (spec 3, 11, 16)
        Re-checked at every dispatch so status changes / race conditions are
        respected — an offline or busy partner never gets a notification."""
        ids = [pid for pid in (partner_ids or []) if pid]
        if not ids:
            return []
        online = await db.users.find(
            {"id": {"$in": ids}, "role": "partner", "partner_status": "online",
             "status": "active", "suspended": {"$ne": True}, "kyc_status": "approved"},
            {"_id": 0, "id": 1}).to_list(1000)
        online_ids = [u["id"] for u in online]
        if not online_ids:
            return []
        busy = await db.bookings.find(
            {"partner_id": {"$in": online_ids},
             "status": {"$in": ["assigned", "arrived_shop", "arrived_customer", "started"]}},
            {"_id": 0, "partner_id": 1}).to_list(2000)
        busy_ids = {b["partner_id"] for b in busy}
        # preserve the incoming (score-sorted) order
        return [pid for pid in ids if pid in set(online_ids) and pid not in busy_ids]



class ServiceAreaEngine:
    """Decides whether a customer address is inside a serviced area.

    Coverage is granted (in priority order) when the address:
      1. pincode is listed in any active area's `pincodes`, OR
      2. falls within an area's `radius_km` of its `center_lat`/`center_lng`, OR
      3. city matches an active area's `city`.
    If NO active service areas are configured, the whole platform is treated as
    open (serviceable everywhere) so nothing breaks before setup."""

    @staticmethod
    def _pins(area):
        pins = area.get("pincodes") or []
        if isinstance(pins, str):
            pins = pins.split(",")
        return [str(p).strip() for p in pins if str(p).strip()]

    @staticmethod
    def _point_in_polygon(lat, lng, poly):
        """Ray-casting point-in-polygon. poly is a list of {lat,lng} (or [lat,lng])."""
        pts = []
        for p in poly or []:
            if isinstance(p, dict):
                a, b = p.get("lat"), p.get("lng")
            elif isinstance(p, (list, tuple)) and len(p) >= 2:
                a, b = p[0], p[1]
            else:
                continue
            try:
                pts.append((float(a), float(b)))
            except (TypeError, ValueError):
                continue
        if len(pts) < 3:
            return False
        inside = False
        n = len(pts)
        j = n - 1
        for i in range(n):
            yi, xi = pts[i]      # lat, lng
            yj, xj = pts[j]
            if ((xi > lng) != (xj > lng)) and (lat < (yj - yi) * (lng - xi) / ((xj - xi) or 1e-12) + yi):
                inside = not inside
            j = i
        return inside

    @staticmethod
    async def check(address: dict) -> dict:
        areas = await db.service_areas.find({}, {"_id": 0}).to_list(1000)
        active = [a for a in areas if str(a.get("status", "active")).lower() != "inactive"]
        if not active:
            return {"serviceable": True, "area": None, "match": "open"}
        addr = address or {}
        pin = str(addr.get("pincode", "")).strip()
        city = str(addr.get("city", "")).strip().lower()
        lat, lng = addr.get("lat"), addr.get("lng")
        # 1) exact pincode
        for a in active:
            if pin and pin in ServiceAreaEngine._pins(a):
                return {"serviceable": True, "area": a.get("name"), "city": a.get("city"), "match": "pincode"}
        # 2) custom polygon (oddly-shaped zones), then radius around area centre
        if lat is not None and lng is not None:
            try:
                clat_f, clng_f = float(lat), float(lng)
                for a in active:
                    poly = a.get("polygon")
                    if poly and ServiceAreaEngine._point_in_polygon(clat_f, clng_f, poly):
                        return {"serviceable": True, "area": a.get("name"), "city": a.get("city"), "match": "polygon"}
                cust = (clat_f, clng_f)
                for a in active:
                    clat, clng, rad = a.get("center_lat"), a.get("center_lng"), a.get("radius_km")
                    if clat in (None, "") or clng in (None, "") or not rad:
                        continue
                    d = MatchingEngine._haversine_km(cust, (float(clat), float(clng)))
                    if d <= float(rad):
                        return {"serviceable": True, "area": a.get("name"), "city": a.get("city"),
                                "match": "radius", "distance_km": round(d, 1)}
            except (TypeError, ValueError):
                pass
        # 3) city fallback
        for a in active:
            if city and str(a.get("city", "")).strip().lower() == city:
                return {"serviceable": True, "area": a.get("name"), "city": a.get("city"), "match": "city"}
        return {"serviceable": False, "area": None, "match": "none",
                "serviced_cities": sorted({a.get("city") for a in active if a.get("city")})}
