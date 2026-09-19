import uuid
from typing import Optional, List
from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


class SEO(BaseModel):
    title: str = ""
    keywords: str = ""
    description: str = ""
    canonical: str = ""
    image: str = ""
    schema_jsonld: str = ""
    og_title: str = ""
    og_description: str = ""
    og_image: str = ""


class CategoryCreate(BaseModel):
    name: str
    slug: str = ""
    icon: str = "wrench"
    image: str = ""
    description: str = ""
    required_skill: str = ""
    status: str = "active"
    is_featured: bool = False
    show_on_home: bool = True
    order: int = 0
    seo: dict = Field(default_factory=dict)


class SubCategoryCreate(BaseModel):
    category_id: str
    name: str
    slug: str = ""
    image: str = ""
    description: str = ""
    status: str = "active"
    is_featured: bool = False
    order: int = 0
    seo: dict = Field(default_factory=dict)


class AddonModel(BaseModel):
    name: str
    price: float


class FaqItem(BaseModel):
    question: str
    answer: str


class ServiceCreate(BaseModel):
    category_id: str
    subcategory_id: str = ""
    name: str
    slug: str = ""
    tags: List[str] = []
    short_description: str = ""
    description: str = ""
    image: str = ""
    gallery: List[str] = []
    # pricing
    price_type: str = "fixed"  # fixed | per_hour | per_person | per_sqft
    base_price: float = 0            # original price
    discounted_price: float = 0
    tax_pct: float = 0
    tax_ids: List[str] = []      # selected tax ids (from Integration Center taxes); tax_pct = their sum
    tax_inclusive: bool = False
    # operational
    provider_id: str = ""
    duration_min: int = 60
    max_qty: int = 5
    members_required: int = 1
    required_skill: str = ""
    addons: List[AddonModel] = []
    # Rich variants/packs — [{label, qty, price, original_price, badge, image, rating, review_count, description, duration_min}]
    tiers: List[dict] = []
    highlights: List[str] = []          # bullet points shown in "HIGHLIGHTS" section
    faqs: List[FaqItem] = []
    # flags
    cancelable: bool = True
    at_store: bool = False
    at_doorstep: bool = True
    approval_status: str = "approved"   # approved | disapproved
    is_customizable: bool = False
    ai_diagnosis: bool = False
    is_featured: bool = False
    is_trending: bool = False
    show_on_home: bool = True
    status: str = "active"
    rating: float = 4.8
    review_count: int = 0               # used for rich-snippet AggregateRating
    seo: dict = Field(default_factory=dict)
