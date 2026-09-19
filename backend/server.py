import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from config.database import client  # noqa: E402
from services.seed_service import seed  # noqa: E402
from routes.auth_routes import router as auth_router  # noqa: E402
from routes.catalog_routes import router as catalog_router  # noqa: E402
from routes.booking_routes import router as booking_router  # noqa: E402
from routes.merchant_routes import router as merchant_router  # noqa: E402
from routes.wallet_routes import router as wallet_router  # noqa: E402
from routes.admin_routes import router as admin_router  # noqa: E402
from routes.ai_routes import router as ai_router  # noqa: E402
from routes.content_routes import router as content_router  # noqa: E402
from routes.payment_routes import router as payment_router  # noqa: E402
from routes.geo_routes import router as geo_router  # noqa: E402
from routes.media_routes import router as media_router  # noqa: E402
from routes.site_routes import router as site_router  # noqa: E402
from routes.partner_routes import router as partner_router  # noqa: E402
from routes.partner_admin_routes import router as partner_admin_router  # noqa: E402
from routes.partner_reg_routes import router as partner_reg_router  # noqa: E402
from routes.partner_reg_admin_routes import router as partner_reg_admin_router  # noqa: E402
from routes.notification_routes import router as notification_router  # noqa: E402
from routes.notification_admin_routes import router as notification_admin_router  # noqa: E402
from routes.partner_reg_proxy_routes import admin_reg_router, merchant_reg_router  # noqa: E402
from routes.realtime_routes import router as realtime_router  # noqa: E402
from routes.merchant_reg_routes import router as merchant_self_reg_router  # noqa: E402
from routes.merchant_reg_proxy_routes import router as merchant_admin_reg_router  # noqa: E402
from routes.invoice_routes import router as invoice_router  # noqa: E402
from routes.membership_routes import router as membership_router, admin_router as membership_admin_router  # noqa: E402
from routes.loyalty_routes import router as loyalty_router, admin_router as loyalty_admin_router  # noqa: E402
from routes.support_routes import router as support_router  # noqa: E402
from routes.ratecard_routes import router as ratecard_router  # noqa: E402
from routes.starter_kit_routes import router as starter_kit_router  # noqa: E402
from routes.merchant_panel_routes import router as merchant_panel_router  # noqa: E402
from routes.merchant_crm_routes import router as merchant_crm_router  # noqa: E402
from routes.merchant_referral_routes import router as merchant_referral_router  # noqa: E402
from routes.referral_routes import router as referral_router  # noqa: E402
from routes.admin_people_routes import router as admin_people_router  # noqa: E402
from routes.growth_routes import router as growth_router  # noqa: E402
from routes.growth_admin_routes import router as growth_admin_router  # noqa: E402
from routes.superadmin_routes import router as superadmin_router  # noqa: E402
from routes.custom_job_routes import router as custom_job_router  # noqa: E402
from routes.physical_qr_routes import router as physical_qr_router  # noqa: E402
from routes.agent_routes import router as agent_router  # noqa: E402
from middleware.perf_middleware import PerfMiddleware  # noqa: E402

app = FastAPI(title="AzoApp API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "AzoApp Home Service Platform API", "status": "ok"}


for r in [auth_router, catalog_router, booking_router, merchant_router, merchant_crm_router,
          wallet_router, admin_router, ai_router, content_router, payment_router, geo_router,
          media_router, site_router, partner_router, partner_admin_router,
          partner_reg_router, partner_reg_admin_router, notification_router, notification_admin_router,
          admin_reg_router, merchant_reg_router, realtime_router, merchant_self_reg_router,
          invoice_router, membership_router, membership_admin_router,
          loyalty_router, loyalty_admin_router, support_router, ratecard_router,
          starter_kit_router, merchant_panel_router, referral_router, admin_people_router,
          merchant_referral_router,
          merchant_admin_reg_router, growth_router, growth_admin_router, superadmin_router,
          custom_job_router, physical_qr_router, agent_router]:
    api_router.include_router(r)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Outermost: measure end-to-end latency of every /api request for the
# Super Admin -> Performance page (records into services.perf_service).
app.add_middleware(PerfMiddleware)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("azoapp")


@app.on_event("startup")
async def startup():
    await seed()
    # Partner registration masters (education/experience defaults)
    try:
        from services.partner_reg_service import seed_masters
        await seed_masters()
        from services.template_service import seed_templates
        await seed_templates()
    except Exception as e:  # noqa: BLE001
        logger.warning("partner masters seed skipped: %s", e)
    # Advanced merchant panel demo data (reminders/network/commission/wallet)
    try:
        from services.merchant_panel_service import seed_demo_default
        res = await seed_demo_default()
        logger.info("merchant panel demo seed: %s", res)
    except Exception as e:  # noqa: BLE001
        logger.warning("merchant panel demo seed skipped: %s", e)
    # Physical QR demo batches (idempotent; only when no stickers exist yet)
    try:
        from services.physical_qr_service import seed_demo_batches
        res = await seed_demo_batches()
        logger.info("physical qr demo batches: %s", res)
    except Exception as e:  # noqa: BLE001
        logger.warning("physical qr demo batches skipped: %s", e)
    # India location cascade import (idempotent; skips if already loaded)
    try:
        from services.geo_data_service import import_geo
        res = await import_geo()
        logger.info("geo import: %s", res)
    except Exception as e:  # noqa: BLE001
        logger.warning("geo import skipped: %s", e)
    # Make every partner dispatchable: normalise skills to canonical keys and copy
    # city / pincode / GPS / serviceable pincodes from the registration profile +
    # Service Areas (idempotent; fixes partners approved before this sync existed).
    try:
        from services.partner_sync import repair_all_partners
        fixed = await repair_all_partners()
        logger.info("partner area/skill sync: %d updated", fixed)
    except Exception as e:  # noqa: BLE001
        logger.warning("partner sync skipped: %s", e)
    try:
        from config.database import db as _db
        await _db.profile_changes.create_index([("role", 1), ("reviewed", 1), ("changed_at", -1)])
        await _db.profile_changes.create_index([("user_id", 1), ("changed_at", -1)])
        await _db.users.create_index([("role", 1), ("profile_update_unreviewed", 1), ("profile_updated_at", -1)])
    except Exception as e:  # noqa: BLE001
        logger.warning("profile_changes index skipped: %s", e)
    # Invoice idempotency: unique indexes so no duplicate invoices are EVER created
    # (webhook retries / double-clicks / reloads / cron re-runs / concurrent requests).
    try:
        from services.invoice_service import ensure_indexes as _inv_idx
        await _inv_idx()
        logger.info("invoice unique indexes ready")
    except Exception as e:  # noqa: BLE001
        logger.warning("invoice index skipped: %s", e)
    # Central index creation for all hot query paths (login/lists/dashboards).
    try:
        from services.index_service import ensure_indexes
        await ensure_indexes()
    except Exception as e:  # noqa: BLE001
        logger.warning("ensure_indexes skipped: %s", e)
    # Purge accounts soft-deleted more than 30 days ago (recycle-bin retention).
    try:
        from services.people_admin_service import purge_expired_deletions
        n = await purge_expired_deletions(30)
        if n:
            logger.info("purged %d expired soft-deleted account(s)", n)
    except Exception as e:  # noqa: BLE001
        logger.warning("purge_expired_deletions skipped: %s", e)
    # Auto-delete scratch cards scratched more than 30 days ago (product #11).
    try:
        from services.growth_service import purge_old_scratched_cards
        n = await purge_old_scratched_cards(30)
        if n:
            logger.info("purged %d old scratched card(s)", n)
    except Exception as e:  # noqa: BLE001
        logger.warning("purge_old_scratched_cards skipped: %s", e)
    # Marketing module demo data (loyalty ledger, offers analytics, memberships, banners)
    try:
        from config.database import db as _mdb
        if await _mdb.users.count_documents({"role": "customer"}) < 10:
            import seed_marketing_demo as _mkt
            res = await _mkt.main()
            logger.info("marketing demo seed: %s", res)
    except Exception as e:  # noqa: BLE001
        logger.warning("marketing demo seed skipped: %s", e)
    logger.info("AzoApp seed complete")

    # Bring the Redis/cache manager in line with any saved config (in-memory
    # fallback if disabled or unreachable). Safe no-op when nothing is saved.
    try:
        from services import cache_service as _cs
        await _cs.apply_saved_config()
        logger.info("cache config applied: live=%s", _cs.cache.is_live())
    except Exception as e:  # noqa: BLE001
        logger.warning("cache config apply skipped: %s", e)

    # Idempotency guard for booking creation (safe retries on slow networks).
    try:
        from config.database import db as _db
        await _db.bookings.create_index(
            [("customer_id", 1), ("idempotency_key", 1)],
            unique=True, name="uniq_customer_idem",
            partialFilterExpression={"idempotency_key": {"$type": "string"}},
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("booking idempotency index skipped: %s", e)

    # Job auto-expiry: DISABLED per product requirement — a 'searching' booking is
    # NEVER auto-cancelled. It stays open until a partner accepts or an admin acts.
    import asyncio as _asyncio  # noqa: F401  (kept for other sweeps below)
    # (auto-expiry loop intentionally not started)

    # Activity-log TTL index (auto-delete logs > 30 days)
    try:
        from services import activity_service
        await activity_service.ensure_indexes()
    except Exception as e:  # noqa: BLE001
        logger.warning("activity index skipped: %s", e)

    # Give every partner a permanent unique code (AZP + 7 digits)
    try:
        from services import partner_code_service
        await partner_code_service.backfill()
        from services import merchant_code_service
        await merchant_code_service.backfill()
    except Exception as e:  # noqa: BLE001
        logger.warning("partner code backfill skipped: %s", e)

    # Background sweep: auto-reactivate partners whose suspension has expired.
    import asyncio
    from datetime import datetime, timezone

    async def _suspend_sweep():
        from config.database import db
        while True:
            try:
                now = datetime.now(timezone.utc).isoformat()
                await db.users.update_many(
                    {"suspended": True, "suspend_until": {"$lte": now}},
                    {"$set": {"suspended": False}, "$unset": {
                        "suspend_reason": "", "suspend_until": "", "suspend_days": "",
                        "suspended_at": "", "suspended_by": ""}})
            except Exception as e:  # noqa: BLE001
                logger.warning("suspend sweep error: %s", e)
            await asyncio.sleep(300)  # every 5 minutes

    try:
        asyncio.create_task(_suspend_sweep())
    except Exception as e:  # noqa: BLE001
        logger.warning("suspend sweep not started: %s", e)

    # Daily sweep: notify merchants + customers for AMC/follow-up reminders due today.
    async def _reminder_due_sweep():
        from services import merchant_ops_service as ops
        while True:
            try:
                n = await ops.process_due_reminders()
                if n:
                    logger.info("reminder due alerts sent: %s", n)
            except Exception as e:  # noqa: BLE001
                logger.warning("reminder due sweep error: %s", e)
            await asyncio.sleep(3600)  # hourly (idempotent per reminder/day)

    try:
        asyncio.create_task(_reminder_due_sweep())
    except Exception as e:  # noqa: BLE001
        logger.warning("reminder due sweep not started: %s", e)

    # Hourly sweep: partner growth — daily evening streak reminders + weekly
    # leaderboard rewards for the previous week's top-3. Both are idempotent.
    async def _partner_growth_sweep():
        from services import partner_service as _ps
        while True:
            try:
                r = await _ps.send_streak_reminders()
                if r:
                    logger.info("streak reminders sent: %s", r)
                a = await _ps.process_leaderboard_rewards()
                if a:
                    logger.info("leaderboard rewards awarded: %s", a)
                from services import starter_kit_service as _sk
                rr = await _sk.send_renewal_reminders()
                if rr and rr.get("nudged"):
                    logger.info("starter kit renewal reminders sent: %s", rr)
            except Exception as e:  # noqa: BLE001
                logger.warning("partner growth sweep error: %s", e)
            await asyncio.sleep(3600)  # hourly

    try:
        asyncio.create_task(_partner_growth_sweep())
    except Exception as e:  # noqa: BLE001
        logger.warning("partner growth sweep not started: %s", e)

    # Hourly sweep: scheduled analytics reports — generate + email any due schedule.
    async def _scheduled_reports_sweep():
        from services import scheduled_reports_service as _srs
        while True:
            try:
                n = await _srs.due_sweep()
                if n:
                    logger.info("scheduled reports run: %s", n)
            except Exception as e:  # noqa: BLE001
                logger.warning("scheduled reports sweep error: %s", e)
            await asyncio.sleep(3600)  # hourly

    try:
        asyncio.create_task(_scheduled_reports_sweep())
    except Exception as e:  # noqa: BLE001
        logger.warning("scheduled reports sweep not started: %s", e)

    # Fast sweep: booking dispatch escalation. Every ~7s, any 'searching' booking
    # whose current wave has been ringing past the TTL without an accept gets its
    # pending offers marked 'timeout' and the NEXT wave of (wider-ring) partners
    # alerted — an automatic retry cycle. (spec 1, 8, 25)
    async def _dispatch_escalation_sweep():
        from controllers import booking_controller as _bc
        while True:
            try:
                n = await _bc.dispatch_escalation_tick()
                if n:
                    logger.info("dispatch escalation: %s booking(s) advanced a wave", n)
            except Exception as e:  # noqa: BLE001
                logger.warning("dispatch escalation sweep error: %s", e)
            try:
                r = await _bc.scheduled_reminder_tick()
                if r:
                    logger.info("scheduled reminders: %s booking(s) entered 30-min window", r)
            except Exception as e:  # noqa: BLE001
                logger.warning("scheduled reminder sweep error: %s", e)
            await asyncio.sleep(7)  # near-real-time re-dispatch

    try:
        asyncio.create_task(_dispatch_escalation_sweep())
    except Exception as e:  # noqa: BLE001
        logger.warning("dispatch escalation sweep not started: %s", e)

    # Retention sweep: delete notification history older than 7 days (admin
    # campaigns + per-user in-app notifications + delivery logs) and any refresh
    # tokens that expired more than 7 days ago. Runs on boot, then every 6 hours.
    async def _retention_sweep():
        from services import retention_service as _rs
        while True:
            try:
                removed = await _rs.cleanup()
                if removed:
                    logger.info("retention cleanup (7d): %s", removed)
            except Exception as e:  # noqa: BLE001
                logger.warning("retention sweep error: %s", e)
            await asyncio.sleep(6 * 3600)  # every 6 hours

    try:
        asyncio.create_task(_retention_sweep())
    except Exception as e:  # noqa: BLE001
        logger.warning("retention sweep not started: %s", e)

    # Partner daily online reset + calendar auto-online sweep (spec: online valid for
    # TODAY only; calendar-available dates auto-online). Runs on boot, then every 5 min
    # so the IST day-rollover is picked up promptly. Idempotent + safe.
    async def _partner_availability_sweep():
        from services import partner_service as _ps
        while True:
            try:
                r = await _ps.partner_daily_reset_tick()
                if r and (r.get("reset") or r.get("auto_online")):
                    logger.info("partner daily reset: %s", r)
            except Exception as e:  # noqa: BLE001
                logger.warning("partner availability sweep error: %s", e)
            await asyncio.sleep(300)  # every 5 minutes

    try:
        asyncio.create_task(_partner_availability_sweep())
    except Exception as e:  # noqa: BLE001
        logger.warning("partner availability sweep not started: %s", e)



@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
