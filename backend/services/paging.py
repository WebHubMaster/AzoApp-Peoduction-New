"""Opt-in list pagination for mobile infinite scroll (page_size=0 keeps the legacy response)."""


def page_list(items, page: int = 1, page_size: int = 0):
    if not page_size or page_size <= 0:
        return items
    page_size = min(int(page_size), 100)
    page = max(1, int(page or 1))
    start = (page - 1) * page_size
    chunk = items[start:start + page_size]
    return {"items": chunk, "total": len(items), "page": page, "page_size": page_size,
            "has_more": start + len(chunk) < len(items)}


def page_key(doc: dict, key: str, page: int = 1, page_size: int = 0):
    """Paginate a list embedded in a dict response; other keys are kept unchanged."""
    if not page_size or page_size <= 0:
        return doc
    p = page_list(doc.get(key) or [], page, page_size)
    return {**doc, key: p["items"], **p}
