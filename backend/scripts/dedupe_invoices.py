"""One-time cleanup migration for the invoice collection.

Fixes the historical "multiple / duplicate invoices" issue at the ROOT (data + index):
  1. Removes redundant generic "transaction" invoices that were spawned for
     booking-linked / internal ledger movements (booking_payment, refund, commission,
     etc.) — these are already represented by the booking Service Invoice /
     Cancellation-Adjustment document, so they were pure duplicates/clutter.
  2. De-duplicates any remaining invoices:
       - booking invoices  → keep ONE per (booking_id, invoice_type)
       - transaction invoices → keep ONE per transaction_id
       - withdrawal invoices  → keep ONE per withdrawal_id
     (keeps the earliest by created_at; deletes the rest)
  3. Creates the unique indexes so duplicates can never be created again.

Idempotent + safe to re-run. Usage:  python -m scripts.dedupe_invoices  (from backend/)
"""
import asyncio
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.database import db  # noqa: E402
from services.invoice_service import _TXN_SKIP_KINDS, ensure_indexes  # noqa: E402


async def main():
    report = {"redundant_txn_deleted": 0, "dup_booking_deleted": 0,
              "dup_txn_deleted": 0, "dup_wd_deleted": 0}

    # 1) Remove redundant transaction invoices for booking-linked / internal kinds.
    res = await db.invoices.delete_many(
        {"invoice_type": "transaction", "txn_kind": {"$in": list(_TXN_SKIP_KINDS)}})
    report["redundant_txn_deleted"] = res.deleted_count

    all_invs = await db.invoices.find({}, {"_id": 0}).sort("created_at", 1).to_list(100000)

    def _dedupe(group_key_fn, predicate):
        keep = {}
        to_delete = []
        for inv in all_invs:
            if not predicate(inv):
                continue
            k = group_key_fn(inv)
            if k in keep:
                to_delete.append(inv["id"])
            else:
                keep[k] = inv["id"]
        return to_delete

    # 2a) booking invoices — one per (booking_id, invoice_type)
    dupe_ids = _dedupe(
        lambda i: (i.get("booking_id"), i.get("invoice_type")),
        lambda i: bool(i.get("booking_id")) and i.get("invoice_type") in ("booking", "cancellation"))
    if dupe_ids:
        r = await db.invoices.delete_many({"id": {"$in": dupe_ids}})
        report["dup_booking_deleted"] = r.deleted_count

    # refresh list after deletions
    all_invs = await db.invoices.find({}, {"_id": 0}).sort("created_at", 1).to_list(100000)

    # 2b) transaction invoices — one per transaction_id
    dupe_ids = _dedupe(
        lambda i: i.get("transaction_id"),
        lambda i: i.get("invoice_type") == "transaction" and bool(i.get("transaction_id")))
    if dupe_ids:
        r = await db.invoices.delete_many({"id": {"$in": dupe_ids}})
        report["dup_txn_deleted"] = r.deleted_count

    all_invs = await db.invoices.find({}, {"_id": 0}).sort("created_at", 1).to_list(100000)

    # 2c) withdrawal invoices — one per withdrawal_id
    dupe_ids = _dedupe(
        lambda i: i.get("withdrawal_id"),
        lambda i: i.get("invoice_type") == "withdrawal" and bool(i.get("withdrawal_id")))
    if dupe_ids:
        r = await db.invoices.delete_many({"id": {"$in": dupe_ids}})
        report["dup_wd_deleted"] = r.deleted_count

    # 3) (re)build unique indexes
    import services.invoice_service as _svc
    _svc._INDEXES_READY = False
    await ensure_indexes()

    remaining = await db.invoices.count_documents({})
    print("Invoice dedupe complete:", report, "| remaining invoices:", remaining)


if __name__ == "__main__":
    asyncio.run(main())
