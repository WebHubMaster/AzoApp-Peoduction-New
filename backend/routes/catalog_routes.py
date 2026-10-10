from fastapi import APIRouter, Depends
from controllers import catalog_controller as c
from models.catalog import CategoryCreate, SubCategoryCreate, ServiceCreate
from middleware.auth import require_role, get_current_user_optional

router = APIRouter(prefix="/catalog", tags=["catalog"])
ADMIN = require_role("admin")


# ---------- PUBLIC ----------
@router.get("/categories")
async def categories():
    from services.city_pricing_service import filter_categories
    return await filter_categories(await c.list_categories())


@router.get("/category/{slug_or_id}")
async def category(slug_or_id: str):
    from services.city_pricing_service import active_doc
    cat = await c.get_category(slug_or_id)
    if not cat:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Category not found")
    doc = await active_doc()
    if doc and cat:
        allowed = set(doc.get("categories") or [])
        check_id = cat.get("category_id") or cat.get("id")
        cat["city_available"] = check_id in allowed
        cat["city"] = doc.get("city")
    else:
        cat["city_available"] = True
    return cat


@router.get("/subcategories")
async def subcategories(category_id: str = None):
    from services.city_pricing_service import active_doc
    subs = await c.list_subcategories(category_id)
    doc = await active_doc()
    if not doc:
        return subs
    allowed = set(doc.get("categories") or [])
    return [s for s in subs if s.get("category_id") in allowed]


@router.get("/services")
async def services(category_id: str = None, subcategory_id: str = None, q: str = None,
                   featured: bool = None, trending: bool = None, city: str = None,
                   user=Depends(get_current_user_optional)):
    from services.city_pricing_service import filter_services
    return await filter_services(await c.list_services(category_id, subcategory_id, q, featured, trending, user), city or None)


@router.get("/upsell")
async def upsell(service_ids: str = ""):
    from services.city_pricing_service import filter_services
    ids = [x.strip() for x in (service_ids or "").split(",") if x.strip()]
    out = await c.upsell_suggestions(ids)
    out["frequently_together"] = await filter_services(out.get("frequently_together") or [])
    return out


@router.get("/services/{service_id}")
async def service(service_id: str, user=Depends(get_current_user_optional)):
    from fastapi import HTTPException
    from services.city_pricing_service import price_one
    out = await price_one(await c.get_service(service_id, public=True, user=user))
    if not out:
        raise HTTPException(status_code=404, detail="This service is not available in your city")
    return out


# ---------- ADMIN listing (all records) ----------
@router.get("/admin/categories")
async def admin_categories(admin=Depends(ADMIN)):
    return await c.admin_list_categories()


@router.get("/admin/subcategories")
async def admin_subcategories(category_id: str = None, admin=Depends(ADMIN)):
    return await c.admin_list_subcategories(category_id)


@router.get("/admin/services")
async def admin_services(category_id: str = None, subcategory_id: str = None, q: str = None, admin=Depends(ADMIN)):
    return await c.admin_list_services(category_id, subcategory_id, q)


@router.get("/admin/services/{service_id}")
async def admin_service(service_id: str, admin=Depends(ADMIN)):
    return await c.admin_get_service(service_id)


# ---------- CATEGORY CRUD ----------
@router.post("/categories")
async def create_category(data: CategoryCreate, admin=Depends(ADMIN)):
    return await c.create_category(data.model_dump())


@router.put("/categories/{category_id}")
async def update_category(category_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.update_category(category_id, data)


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, admin=Depends(ADMIN)):
    return await c.delete_category(category_id)


# ---------- SUBCATEGORY CRUD ----------
@router.post("/subcategories")
async def create_subcategory(data: SubCategoryCreate, admin=Depends(ADMIN)):
    return await c.create_subcategory(data.model_dump())


@router.put("/subcategories/{sub_id}")
async def update_subcategory(sub_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.update_subcategory(sub_id, data)


@router.delete("/subcategories/{sub_id}")
async def delete_subcategory(sub_id: str, admin=Depends(ADMIN)):
    return await c.delete_subcategory(sub_id)


# ---------- SERVICE CRUD ----------
@router.post("/services")
async def create_service(data: ServiceCreate, admin=Depends(ADMIN)):
    return await c.create_service(data.model_dump())


@router.post("/services/{service_id}/duplicate")
async def duplicate_service(service_id: str, admin=Depends(ADMIN)):
    return await c.duplicate_service(service_id)


@router.put("/services/{service_id}")
async def update_service(service_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.update_service(service_id, data)


@router.delete("/services/{service_id}")
async def delete_service(service_id: str, admin=Depends(ADMIN)):
    return await c.delete_service(service_id)


# ---------- ADD-ON LIBRARY (category-wise) ----------
@router.get("/addons")
async def public_addons(category_id: str = None, q: str = None):
    """Active add-ons (used by admin service form to pick from & public if needed).
    City-gated: add-ons of a category that is disabled in the active city are hidden."""
    from services.city_pricing_service import active_doc
    addons = await c.list_addons(category_id, q, admin=False)
    doc = await active_doc()
    if not doc:
        return addons
    allowed = set(doc.get("categories") or [])
    return [a for a in addons if a.get("category_id") in allowed]


@router.get("/admin/addons")
async def admin_addons(category_id: str = None, q: str = None, admin=Depends(ADMIN)):
    return await c.list_addons(category_id, q, admin=True)


@router.post("/addons")
async def create_addon(data: dict, admin=Depends(ADMIN)):
    return await c.create_addon(data)


@router.put("/addons/{addon_id}")
async def update_addon(addon_id: str, data: dict, admin=Depends(ADMIN)):
    return await c.update_addon(addon_id, data)


@router.delete("/addons/{addon_id}")
async def delete_addon(addon_id: str, admin=Depends(ADMIN)):
    return await c.delete_addon(addon_id)
