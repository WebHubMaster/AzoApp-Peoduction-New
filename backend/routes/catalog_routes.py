from fastapi import APIRouter, Depends
from controllers import catalog_controller as c
from models.catalog import CategoryCreate, SubCategoryCreate, ServiceCreate
from middleware.auth import require_role

router = APIRouter(prefix="/catalog", tags=["catalog"])
ADMIN = require_role("admin")


# ---------- PUBLIC ----------
@router.get("/categories")
async def categories():
    return await c.list_categories()


@router.get("/category/{slug_or_id}")
async def category(slug_or_id: str):
    return await c.get_category(slug_or_id)


@router.get("/subcategories")
async def subcategories(category_id: str = None):
    return await c.list_subcategories(category_id)


@router.get("/services")
async def services(category_id: str = None, subcategory_id: str = None, q: str = None,
                   featured: bool = None, trending: bool = None):
    return await c.list_services(category_id, subcategory_id, q, featured, trending)


@router.get("/upsell")
async def upsell(service_ids: str = ""):
    ids = [x.strip() for x in (service_ids or "").split(",") if x.strip()]
    return await c.upsell_suggestions(ids)


@router.get("/services/{service_id}")
async def service(service_id: str):
    return await c.get_service(service_id, public=True)


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
    """Active add-ons (used by admin service form to pick from & public if needed)."""
    return await c.list_addons(category_id, q, admin=False)


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
