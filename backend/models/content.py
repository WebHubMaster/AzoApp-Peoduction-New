from typing import Optional, List, Any
from pydantic import BaseModel, Field, ConfigDict


class SeoMeta(BaseModel):
    """Reusable advanced SEO block attached to CMS content."""
    model_config = ConfigDict(extra="allow")
    seo_title: str = ""
    meta_description: str = ""
    focus_keyword: str = ""
    secondary_keywords: List[str] = []
    slug: str = ""
    canonical_url: str = ""
    robots_index: bool = True
    robots_follow: bool = True
    og_title: str = ""
    og_description: str = ""
    og_image: str = ""
    twitter_title: str = ""
    twitter_description: str = ""
    twitter_image: str = ""
    schema_type: str = ""          # e.g. Article, BlogPosting, FAQPage, WebPage
    custom_schema: str = ""        # raw JSON-LD string (admin power-user)


class FaqCategoryCreate(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    slug: str = ""
    order: int = 0
    status: str = "active"


class TestimonialCreate(BaseModel):
    title: str = ""                 # bold heading e.g. "Very time convenient!"
    text: str = ""                  # the review body
    name: str = ""                  # customer name
    city: str = ""                  # optional sub-label
    rating: float = 5.0
    theme: str = "rose"             # rose | violet | teal | amber | emerald | sky | slate
    avatar: str = ""                # optional image url
    photo: str = ""                 # optional real customer/service photo (prominent)
    service: str = ""               # optional tag e.g. "AC repair"
    order: int = 0
    status: str = "active"


class BannerCreate(BaseModel):
    title: str
    subtitle: str = ""
    image: str = ""
    desktop_image: str = ""
    mobile_image: str = ""
    cta_text: str = ""
    button_url: str = ""
    link: str = ""
    order: int = 0
    status: str = "active"


class FaqCreate(BaseModel):
    model_config = ConfigDict(extra="allow")
    question: str
    answer: str
    category: str = "General"
    order: int = 0
    status: str = "active"


class BlogCreate(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    slug: str = ""
    excerpt: str = ""
    body: str = ""
    image: str = ""              # featured image url
    image_alt: str = ""
    image_caption: str = ""
    image_title: str = ""
    author: str = "AzoApp"
    category: str = ""
    tags: List[str] = []
    status: str = "published"    # draft | published | scheduled
    publish_at: str = ""         # ISO datetime; future => scheduled (not public until then)
    seo: Optional[dict] = None   # advanced SEO block (SeoMeta shape)


class PlanCreate(BaseModel):
    name: str
    price: float
    duration_days: int = 30
    features: List[str] = []
    audience: str = "partner"   # partner | merchant
    status: str = "active"


class NotificationCreate(BaseModel):
    title: str
    body: str
    audience: str = "all"       # all | customer | partner | merchant


class TicketCreate(BaseModel):
    subject: str
    message: str


class TicketReply(BaseModel):
    text: str


class PayoutRequest(BaseModel):
    amount: float = Field(gt=0)
    method: str = "bank"


class RefundCreate(BaseModel):
    booking_id: str
    amount: float = Field(gt=0)
    reason: str = ""
