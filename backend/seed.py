"""Seed initial catalog — run: python seed.py"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from database import AsyncSessionLocal, engine, Base
from sqlalchemy import select
import models as M
import uuid


CATEGORIES = [
    ("Tees", "Heavyweight oversized tees, sharp prints, street-ready."),
    ("Longsleeves", "Extended sleeves, heavier cuts, winter-ready drops."),
    ("Hoodies", "Fleece-lined armor for the underground."),
]

PRODUCTS = [
    {
        "name": "OBSIDIAN CORE TEE",
        "description": "Heavyweight 240gsm cotton. Oversized boxy cut. Screen-printed back graphic.",
        "category": "Tees",
        "base_price": 45.00,
        "compare_price": 60.00,
        "featured": True,
        "variants": [
            {"size": "S", "color": "Black", "color_hex": "#0A0A0A", "stock": 15},
            {"size": "M", "color": "Black", "color_hex": "#0A0A0A", "stock": 25},
            {"size": "L", "color": "Black", "color_hex": "#0A0A0A", "stock": 20},
            {"size": "XL", "color": "Black", "color_hex": "#0A0A0A", "stock": 10},
            {"size": "M", "color": "Bone", "color_hex": "#E8E4D9", "stock": 12},
            {"size": "L", "color": "Bone", "color_hex": "#E8E4D9", "stock": 8},
        ],
    },
    {
        "name": "BLOODLINE GRAPHIC TEE",
        "description": "Premium 280gsm. Front chest hit, oversized back print with bold hand-drawn art.",
        "category": "Tees",
        "base_price": 52.00,
        "featured": True,
        "variants": [
            {"size": "S", "color": "Black", "color_hex": "#0A0A0A", "stock": 10},
            {"size": "M", "color": "Black", "color_hex": "#0A0A0A", "stock": 20},
            {"size": "L", "color": "Black", "color_hex": "#0A0A0A", "stock": 15},
            {"size": "XL", "color": "Black", "color_hex": "#0A0A0A", "stock": 8},
        ],
    },
    {
        "name": "GRID LONGSLEEVE",
        "description": "Double-needle stitched long sleeve. 260gsm. Drop-shoulder oversize.",
        "category": "Longsleeves",
        "base_price": 65.00,
        "featured": True,
        "variants": [
            {"size": "M", "color": "Olive", "color_hex": "#3A3B2B", "stock": 12},
            {"size": "L", "color": "Olive", "color_hex": "#3A3B2B", "stock": 10},
            {"size": "M", "color": "Black", "color_hex": "#0A0A0A", "stock": 18},
            {"size": "L", "color": "Black", "color_hex": "#0A0A0A", "stock": 15},
        ],
    },
    {
        "name": "UNDERWORLD HOODIE",
        "description": "Heavyweight 380gsm fleece. Kangaroo pocket. Embroidered chest badge.",
        "category": "Hoodies",
        "base_price": 95.00,
        "compare_price": 120.00,
        "featured": True,
        "variants": [
            {"size": "M", "color": "Black", "color_hex": "#0A0A0A", "stock": 8},
            {"size": "L", "color": "Black", "color_hex": "#0A0A0A", "stock": 10},
            {"size": "XL", "color": "Black", "color_hex": "#0A0A0A", "stock": 5},
            {"size": "M", "color": "Charcoal", "color_hex": "#2A2A2A", "stock": 6},
        ],
    },
    {
        "name": "SIGNAL FLARE TEE",
        "description": "Safety-orange heat transfer. 220gsm ringspun. Relaxed fit.",
        "category": "Tees",
        "base_price": 40.00,
        "variants": [
            {"size": "S", "color": "Black", "color_hex": "#0A0A0A", "stock": 8},
            {"size": "M", "color": "Black", "color_hex": "#0A0A0A", "stock": 14},
            {"size": "L", "color": "Black", "color_hex": "#0A0A0A", "stock": 12},
        ],
    },
    {
        "name": "RAW CUT PREMIUM",
        "description": "Garment-dyed cotton. Raw-edge hems. Each piece unique.",
        "category": "Tees",
        "base_price": 58.00,
        "variants": [
            {"size": "M", "color": "Stone", "color_hex": "#5A5550", "stock": 6},
            {"size": "L", "color": "Stone", "color_hex": "#5A5550", "stock": 4},
            {"size": "M", "color": "Black", "color_hex": "#0A0A0A", "stock": 10},
        ],
    },
]


def slugify(s):
    import re
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        store = (await db.execute(select(M.Store).limit(1))).scalar_one_or_none()
        if not store:
            store = M.Store(name="Main Store", is_online=True, active=True)
            db.add(store)
            await db.commit()
            await db.refresh(store)

        cat_map = {}
        for name, desc in CATEGORIES:
            existing = (await db.execute(select(M.Category).where(M.Category.slug == slugify(name)))).scalar_one_or_none()
            if existing:
                cat_map[name] = existing
                continue
            c = M.Category(name=name, slug=slugify(name), description=desc)
            db.add(c)
            await db.flush()
            cat_map[name] = c

        for p in PRODUCTS:
            existing = (await db.execute(select(M.Product).where(M.Product.name == p["name"]))).scalar_one_or_none()
            if existing:
                print(f"Skip {p['name']}")
                continue
            prod = M.Product(
                name=p["name"],
                slug=slugify(p["name"]) + "-" + uuid.uuid4().hex[:4],
                description=p["description"],
                category_id=cat_map[p["category"]].id,
                base_price=p["base_price"],
                compare_price=p.get("compare_price"),
                featured=p.get("featured", False),
                status="active",
            )
            db.add(prod)
            await db.flush()
            for v in p["variants"]:
                variant = M.Variant(
                    product_id=prod.id,
                    size=v["size"],
                    color=v["color"],
                    color_hex=v["color_hex"],
                )
                db.add(variant)
                await db.flush()
                db.add(M.Inventory(variant_id=variant.id, store_id=store.id, quantity=v["stock"]))

        await db.commit()
        print("✓ Seeded categories and products.")


if __name__ == "__main__":
    asyncio.run(main())
