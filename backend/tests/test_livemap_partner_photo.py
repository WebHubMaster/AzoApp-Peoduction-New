"""Live Partner Map — admin/partners/live photo field verification."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://maid-billing-correct.preview.emergentagent.com").rstrip("/")


def _admin_token():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/send-otp", json={"phone": "+919000000000", "role": "admin"})
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE}/api/auth/verify-otp", json={"phone": "+919000000000", "otp": "123456", "role": "admin"})
    assert r.status_code == 200, r.text
    data = r.json()
    return data.get("token") or data.get("access_token")


def test_partners_live_includes_photo_field():
    token = _admin_token()
    r = requests.get(f"{BASE}/api/admin/partners/live", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    partners = data.get("partners") or []
    assert len(partners) > 0, "No online partners returned — seed partners +919000000003/5 should be online"
    for p in partners:
        # photo key must be present (may be None/empty for partners w/o photo)
        assert "photo" in p, f"partner {p.get('name')} missing 'photo' key: keys={list(p.keys())}"
    # Specific seeded partners
    by_phone = {p.get("phone"): p for p in partners}
    raj = by_phone.get("+919000000003")
    amit = by_phone.get("+919000000005")
    assert raj, f"Raj Kumar (+919000000003) not in live list; got phones={list(by_phone.keys())}"
    assert amit, f"Amit Singh (+919000000005) not in live list; got phones={list(by_phone.keys())}"
    assert raj.get("photo"), f"Raj Kumar should have a photo set, got {raj.get('photo')!r}"
    assert "unsplash" in (raj.get("photo") or "").lower() or (raj.get("photo") or "").startswith("http"), \
        f"Raj photo not URL-like: {raj.get('photo')!r}"
    # Amit no photo
    assert not amit.get("photo"), f"Amit Singh should have no photo set, got {amit.get('photo')!r}"
