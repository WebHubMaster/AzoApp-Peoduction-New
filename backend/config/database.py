import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent.parent / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Global platform default configuration (admin can override, stored in `settings`)
DEFAULT_SETTINGS = {
    "id": "global",
    "brand": "AzoApp",
    "currency": "INR",
    "platform_commission_pct": 25,   # legacy (kept for backward-compat)
    "partner_commission_pct": 75,    # legacy (kept for backward-compat)
    "merchant_referral_pct": 5,      # legacy
    "merchant_booking_pct": 5,       # legacy
    # Canonical, admin-configurable commission + cancellation model. ALL commissions are
    # a % of the SERVICE COST (base+addons, GST excluded). The four commission %s MUST
    # total 100 — platform absorbs any commission a merchant is ineligible for (fallback),
    # so the whole service cost is always distributed with nothing left over.
    "commission": {
        "platform_pct": 32,                   # platform base commission
        "partner_pct": 60,                    # partner (service performer) commission
        "merchant_partner_referral_pct": 5,   # to merchant who referred/onboarded the partner
        "merchant_customer_pct": 3,           # to merchant through whom the customer booked
        # Cancellation split (must total 100). Applied when a customer cancels BEFORE work starts.
        "customer_refund_pct": 80,            # refunded to the customer
        "partner_cancellation_pct": 20,       # retained as cancellation charge (partner minus platform cut)
    },
    "gst_pct": 18,
    # Job auto-expiry: auto-cancel a booking still 'searching' after N minutes with no
    # partner accepting, and alert admin. Configurable in Integration Center.
    "job_auto_expiry_minutes": 5,
    # Admin-configurable pick-list of reasons a customer can choose when cancelling a booking.
    # "Other" (free text) is always appended by the client, so it need not be listed here.
    "cancellation_reasons": [
        "Booked by mistake",
        "Found a better price elsewhere",
        "Service no longer needed",
        "Partner is taking too long",
        "Scheduling / timing issue",
        "Want to change the service or add-ons",
    ],
    "platform_fee": 20,
    "convenience_fee_pct": 2,
    "emergency_fee": 150,
    "visiting_charge": 49,
    "fees_config": {
        "visiting_charge_enabled": True, "visiting_charge": 49,
        "convenience_fee_enabled": False, "platform_fee_enabled": False,
    },
    "agent_config": {
        "enabled": True,
        "commission_per_mapping": 20,
        "min_withdrawal": 100,
        "max_withdrawal": 25000,
        "pay_once_per_qr": True,
    },
    "slot_capacity": 3,
    # Scheduled-booking START-time slots. Admin-configurable working hours + interval
    # (default 30-minute interval). NOTE: this is only the booking slot granularity —
    # it is NOT the service/work duration and NOT the 30-min pre-work unlock lead time.
    "scheduling": {"slot_start": "08:00", "slot_end": "20:00", "slot_interval_min": 30},
    "referral_base": "partner_earning",  # gross_booking | partner_earning | platform_commission
    "matching_weights": {"skill": 30, "distance": 20, "rating": 20, "availability": 15, "performance": 15},
    "feature_flags": {"ai_assistant": True, "wallet": True, "razorpay": True, "partner_bidding": False},
    "demo_mode": True,
    "demo_otp": "123456",
    "auth_config": {
        "mobile_otp": True, "email_login": False, "social_login": False, "whatsapp_login": False,
        "guest_checkout": True, "two_factor": False, "device_management": False, "account_deletion_approval": True,
    },
    "profile_fields": {
        "gender": True, "dob": True, "alternate_mobile": True, "email": True,
        "language": True, "communication_pref": True, "gst": True, "company": True,
    },
    "languages": [
        {"code": "en", "name": "English", "active": True},
        {"code": "hi", "name": "Hindi", "active": True},
        {"code": "bn", "name": "Bengali", "active": True},
        {"code": "ta", "name": "Tamil", "active": True},
        {"code": "te", "name": "Telugu", "active": True},
        {"code": "mr", "name": "Marathi", "active": True},
    ],
    "address_config": {
        "gps": True, "multiple_addresses": True, "property_type": True,
        "floor_flat": True, "landmark_instructions": True, "serviceability_check": True,
        "pet_info": True, "parking_lift": True, "mandatory_landmark": False,
        "property_types": ["Apartment", "Independent House", "Villa", "Commercial Building", "Farmhouse", "Office"],
        "serviceable_pincodes": [], "service_all_if_empty": True,
    },
    "integrations": {
        "sms_enabled": False, "sms_provider": "fast2sms",
        "fast2sms_api_key": "", "fast2sms_sender_id": "", "fast2sms_route": "otp",
        "fast2sms_otp_template_id": "", "fast2sms_message_id": "",
        "whatsapp_enabled": False, "whatsapp_from": "",
        "otp_resend_cooldown_sec": 30, "otp_max_sends_per_window": 5,
        "otp_send_window_sec": 3600, "otp_max_verify_attempts": 5, "otp_expiry_sec": 600,
        "google_client_id": "", "google_client_secret": "", "facebook_app_id": "", "apple_client_id": "",
        "razorpay_enabled": False, "razorpay_mode": "test",
        "razorpay_test_key_id": "", "razorpay_test_key_secret": "",
        "razorpay_live_key_id": "", "razorpay_live_key_secret": "",
        # Webhook secret (you create this in Razorpay Dashboard → Webhooks). Used to
        # verify refund status webhooks. Per-mode, never exposed to the frontend.
        "razorpay_test_webhook_secret": "", "razorpay_live_webhook_secret": "",
        # RazorpayX Payouts (partner/merchant withdrawals). Safe-simulated until enabled + keys set.
        # Per-mode credentials (legacy single fields kept as TEST fallback).
        "razorpayx_enabled": False, "razorpayx_mode": "test",
        "razorpayx_account_number": "", "razorpayx_key_id": "", "razorpayx_key_secret": "",
        "razorpayx_webhook_secret": "",
        "razorpayx_test_account_number": "", "razorpayx_test_key_id": "", "razorpayx_test_key_secret": "",
        "razorpayx_test_webhook_secret": "",
        "razorpayx_live_account_number": "", "razorpayx_live_key_id": "", "razorpayx_live_key_secret": "",
        "razorpayx_live_webhook_secret": "",
        # ── Active gateway selectors (which gateway processes pay-in / payout) ──
        "active_payin_gateway": "razorpay", "active_payout_gateway": "razorpay",
        # ── Cashfree (pay-in + payout) — separate TEST & LIVE credentials ──
        "cashfree_enabled": False, "cashfree_mode": "test",
        "cashfree_test_pg_app_id": "", "cashfree_test_pg_secret_key": "",
        "cashfree_live_pg_app_id": "", "cashfree_live_pg_secret_key": "",
        "cashfree_test_payout_client_id": "", "cashfree_test_payout_client_secret": "",
        "cashfree_live_payout_client_id": "", "cashfree_live_payout_client_secret": "",
        # ── PayU (pay-in + payout) ──
        "payu_enabled": False, "payu_mode": "test",
        "payu_test_merchant_key": "", "payu_test_salt": "",
        "payu_live_merchant_key": "", "payu_live_salt": "",
        "payu_test_payout_merchant_id": "", "payu_test_payout_client_id": "", "payu_test_payout_client_secret": "",
        "payu_live_payout_merchant_id": "", "payu_live_payout_client_id": "", "payu_live_payout_client_secret": "",
        # ── Easebuzz (pay-in + Wire payout) ──
        "easebuzz_enabled": False, "easebuzz_mode": "test",
        "easebuzz_test_key": "", "easebuzz_test_salt": "",
        "easebuzz_live_key": "", "easebuzz_live_salt": "",
        "easebuzz_test_wire_key": "", "easebuzz_test_wire_salt": "", "easebuzz_test_wire_base": "",
        "easebuzz_live_wire_key": "", "easebuzz_live_wire_salt": "", "easebuzz_live_wire_base": "",
        # ── Juspay (pay-in + payout) ──
        "juspay_enabled": False, "juspay_mode": "test",
        "juspay_test_api_key": "", "juspay_test_merchant_id": "", "juspay_test_payment_page_client_id": "",
        "juspay_test_webhook_username": "", "juspay_test_webhook_password": "",
        "juspay_live_api_key": "", "juspay_live_merchant_id": "", "juspay_live_payment_page_client_id": "",
        "juspay_live_webhook_username": "", "juspay_live_webhook_password": "",
        # Google Maps (live partner tracking on admin dashboard).
        "google_maps_api_key": "",
        # Firebase Cloud Messaging — web push public config (service-account JSON is
        # uploaded separately & stored encrypted). VAPID key + web app config below.
        "fcm_vapid_public_key": "", "fcm_web_api_key": "", "fcm_sender_id": "",
        "fcm_app_id": "",
        "aws_s3_enabled": False, "aws_access_key_id": "", "aws_secret_access_key": "",
        "aws_bucket": "", "aws_region": "ap-south-1", "aws_public_base": "",
        # Aadhaar OCR — admin-configurable vision LLM (no platform key dependency).
        "ocr_enabled": True, "ocr_provider": "gemini", "ocr_model": "gemini-2.5-flash",
        "ocr_api_key": "",
        # AI Assistant (customer/partner/admin chat) — admin-configurable LLM via
        # Integration Center. Provider + model + that provider's own API key.
        "ai_enabled": True, "ai_provider": "anthropic",
        "ai_model": "claude-3-5-sonnet-20241022", "ai_api_key": "",
        # Firebase Cloud Messaging (push). Service-account JSON stored encrypted in fcm_config.
        "fcm_enabled": False, "fcm_project_id": "", "fcm_vapid_key": "",
        "fcm_configured": False,
        "fcm_web_config": {"apiKey": "", "authDomain": "", "projectId": "",
                           "storageBucket": "", "messagingSenderId": "", "appId": ""},
        # Email (SMTP). 100% functional once creds entered.
        "email_enabled": False, "email_provider": "smtp",
        "smtp_host": "", "smtp_port": 587, "smtp_user": "", "smtp_password": "",
        "smtp_from_email": "", "smtp_from_name": "AzoApp", "smtp_use_tls": True,
    },
    "branding": {
        "site_name": "AzoApp", "tagline": "Service at Your Door Steps",
        "logo_light": "", "logo_dark": "", "favicon": "",
        "footer_text": "AzoApp — trusted home services at your doorstep.",
        "phone": "", "email": "", "address": "",
        "social": {"facebook": "", "instagram": "", "twitter": "", "youtube": "", "linkedin": ""},
    },
    "theme": {
        "primary": "#0659B2", "secondary": "#1E7AD6", "accent": "#F59E0B",
        "default_mode": "light",  # light | dark | system
    },
    "business_config": {
        "timezone": "Asia/Kolkata",
        "global_visiting_charge": 100,              # common charge applied to every provider (INR)
        "min_service_amount_for_visiting": 500,     # visiting charge applies only when service amount below this
        "max_distance_km": 15,                      # search radius for nearby providers
        "distance_unit": "km",                      # km | mile
    },
    # Invoice / billing document configuration (admin-editable, used on every invoice).
    "invoice_config": {
        "business_name": "AzoApp",
        "legal_name": "Nodewap Technology Pvt Ltd",
        "email": "nodewaptechnology@gmail.com",
        "phone": "+91 90000 00000",
        "website": "https://azoapp.com",
        "address": "Patna, Bihar, India",
        "city": "Patna", "state": "Bihar", "country": "India", "zip": "800020",
        "gst_number": "", "tax_id": "", "pan": "", "cin": "",
        "prefix": "INV", "pad": 6, "start_number": 1,
        "tax_label": "GST",
        "payment_terms": "Due on receipt",
        "footer_text": "Thank you for choosing AzoApp — service at your doorstep.",
        "terms": "This is a computer-generated invoice. Payment is due upon receipt. All services are subject to AzoApp's standard terms & conditions.",
        "refund_policy": "Refunds/cancellations are processed as per the platform cancellation policy in effect at the time of booking.",
        "support_contact": "support@azoapp.com",
    },
    "seo": {
        "site_title": "AzoApp — On-demand Home Services",
        "meta_description": "Book trusted professionals for AC, appliance, cleaning & more.",
        "meta_keywords": "home services, ac repair, cleaning, electrician, plumber",
        "og_image": "",
    },
    # Refer-a-friend program (admin-configurable in Integration Center / Growth).
    "referral": {
        "enabled": True,
        "reward_amount": 100,      # what the referrer earns (credited to wallet on referee's 1st booking)
        "referee_discount": 100,   # how much off the referred friend gets on their first booking
        "min_booking_amount": 0,   # referee's first booking must be >= this to qualify (0 = any)
        "max_reward": 0,           # cap on referrer reward (0 = no cap)
        "reward_type": "wallet",   # wallet | cashback (both credit the wallet ledger)
        "expiry_days": 90,         # a joined referral must convert within N days (0 = never)
        "max_referrals_per_customer": 0,   # 0 = unlimited
        "require_first_booking": True,
        "eligible_categories": [], # [] = all categories
        "eligible_cities": [],     # [] = all cities
        "campaign_start": "",      # ISO date (empty = always)
        "campaign_end": "",
        "terms": "Reward is credited to your wallet after your friend's first eligible booking is completed. Cannot be combined with other offers. AzoApp may modify or end this program at any time.",
        "card": {
            "heading": "Refer a Friend & Earn",
            "subheading": "Share AzoApp — you both win",
            "cta_text": "Book Now & Save",
            "campaign_text": "Limited period offer",
            "bg": "#0659B2",
            "logo": "",
        },
    },
    # Wallet cashback + scratch-card reward engine (admin-configurable in Growth).
    "cashback": {
        "enabled": True,
        "scratch_enabled": True,
        "type": "pool",            # pool (weighted reward pool) | percent | fixed
        "percent": 10,             # used when type == percent
        "fixed": 50,               # used when type == fixed
        "min_booking_amount": 199, # booking total must be >= this to earn a card
        "max_cashback": 200,       # hard cap on any single reward
        "eligible_categories": [], # [] = all
        "eligible_cities": [],     # [] = all
        "audience": "all",         # all | new | repeat
        "booking_status": "completed",
        "payment_status": "paid",
        "expiry_days": 14,         # scratch card auto-expires after N days (0 = never)
        "max_per_customer": 0,     # 0 = unlimited scratch cards per customer (per campaign)
        "campaign_start": "",
        "campaign_end": "",
    },
    # Combo / bundle packages (admin-managed collection `service_packages`).
    "packages": {
        "enabled": True,
        "homepage_enabled": True,
        "homepage_title": "Combo Offers",
        "homepage_subtitle": "Bundle popular services & save more",
    },
    # Progressive Web App / Add-to-Home-Screen (customer web experience).
    "pwa": {
        "enabled": True,
        "app_name": "AzoApp — Home Services",
        "short_name": "AzoApp",
        "theme_color": "#0659B2",
        "background_color": "#ffffff",
        "install_prompt_enabled": True,
        "install_title": "Install AzoApp",
        "install_message": "Get a faster, app-like experience — add AzoApp to your home screen.",
    },
    "general": {
        "site_name": "AzoApp",
        "support_email": "support@azoapp.com",
        "support_phone": "+91 90000 00000",
        "support_hours": "Mon–Sun, 8 AM – 9 PM",
        "company_address": "Patna, Bihar, India",
    },
    "storage": {
        "provider": "local",       # local | s3
        "s3_bucket": "",
        "s3_region": "",
        "s3_access_key": "",
        "s3_secret_key": "",
    },
}


def _deep_merge(default: dict, doc: dict) -> dict:
    """Fill missing keys from defaults (nested one level) without overwriting stored values."""
    changed = False
    for k, v in default.items():
        if k not in doc:
            doc[k] = v
            changed = True
        elif isinstance(v, dict) and isinstance(doc.get(k), dict):
            for kk, vv in v.items():
                if kk not in doc[k]:
                    doc[k][kk] = vv
                    changed = True
    return changed


async def get_settings() -> dict:
    doc = await db.settings.find_one({"id": "global"}, {"_id": 0})
    if not doc:
        await db.settings.insert_one(dict(DEFAULT_SETTINGS))
        return dict(DEFAULT_SETTINGS)
    if _deep_merge(DEFAULT_SETTINGS, doc):
        await db.settings.update_one({"id": "global"}, {"$set": doc})
    return doc
