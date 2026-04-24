"""Wipe existing seeded data and load polo brand products from user uploads.
Run: python seed_polo.py"""
import asyncio
import sys
import base64
import requests
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select, delete
from database import AsyncSessionLocal, engine, Base
import models as M
import uuid
import re


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


CATEGORIES = [
    ("Heritage", "Crest-emblem polos with classic preppy detailing."),
    ("Wildlife Series", "Animal-emblem signature polos."),
    ("Performance", "Tailored sport polos for the green and beyond."),
]

PRODUCTS = [
    {
        "name": "Forest Dragon Polo",
        "category": "Heritage",
        "image_url": "https://customer-assets.emergentagent.com/job_merch-hub-54/artifacts/c7cg19u0_WhatsApp_Image_202d6-04-24_at_22.09.38-removebg-preview%20%281%29.png",
        "color": "Forest Green",
        "color_hex": "#0F3D2E",
        "description": "Pima cotton pique polo in deep forest green with neon-yellow tipping. Embroidered dragon crest at the chest. Tailored fit, pearl buttons.",
        "base_price": 79.00,
        "compare_price": 95.00,
        "featured": True,
    },
    {
        "name": "Wine Dragon Polo",
        "category": "Heritage",
        "image_url": "https://customer-assets.emergentagent.com/job_merch-hub-54/artifacts/76u2t5k2_WhatsApp_Image_2026-04-2s4_at_22.09.39-removebg-preview.png",
        "color": "Burgundy",
        "color_hex": "#5E1A1F",
        "description": "Burgundy mercerized cotton with peach-blush tipping. Tonal dragon crest, ribbed collar that holds its shape.",
        "base_price": 79.00,
        "featured": True,
    },
    {
        "name": "Terra Rhino Polo",
        "category": "Wildlife Series",
        "image_url": "https://customer-assets.emergentagent.com/job_merch-hub-54/artifacts/gv4sr33n_WhatsApp_Image_2026-04-2s4_at_22.09.40-removebg-preview.png",
        "color": "Terracotta",
        "color_hex": "#A0432D",
        "description": "Sun-faded terracotta polo with cream contrast collar and cuffs. Embroidered rhino emblem. Garment-washed for a softer hand.",
        "base_price": 75.00,
        "featured": True,
    },
    {
        "name": "Navy Marlin Polo",
        "category": "Performance",
        "image_url": "https://customer-assets.emergentagent.com/job_merch-hub-54/artifacts/ifabttjw_WhatsApp_Image_2026-04-24_at_s22.09.40-removebg-preview.png",
        "color": "Navy",
        "color_hex": "#1A2855",
        "description": "Moisture-wicking performance polo in deep navy with safety-orange contrast collar. Marlin emblem. Cut for movement on the green.",
        "base_price": 85.00,
        "compare_price": 110.00,
        "featured": True,
    },
    {
        "name": "Onyx Lion Polo",
        "category": "Wildlife Series",
        "image_url": "https://customer-assets.emergentagent.com/job_merch-hub-54/artifacts/3sldxixm_WhatsApp_Image_2026s-04-24_at_22.09.40-removebg-preview.png",
        "color": "Onyx",
        "color_hex": "#0A0A0A",
        "description": "Jet black mercerized cotton with high-vis orange tipping. Crouching lion emblem. The signature evening polo.",
        "base_price": 89.00,
        "featured": True,
    },
]


def fetch_b64(url: str) -> str | None:
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        return base64.b64encode(r.content).decode("utf-8")
    except Exception as e:
        print(f"  ✗ fetch failed: {e}")
        return None


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Wipe catalog (preserves users, sessions, stores, customers, orders, etc.)
        print("→ wiping existing catalog...")
        await db.execute(delete(M.StockMovement))
        await db.execute(delete(M.Inventory))
        await db.execute(delete(M.ProductImage))
        await db.execute(delete(M.Variant))
        await db.execute(delete(M.Product))
        await db.execute(delete(M.Category))
        await db.commit()

        store = (await db.execute(select(M.Store).limit(1))).scalar_one_or_none()
        if not store:
            store = M.Store(name="Main Store", is_online=True, active=True)
            db.add(store)
            await db.commit()
            await db.refresh(store)

        cat_map = {}
        for name, desc in CATEGORIES:
            c = M.Category(name=name, slug=slugify(name), description=desc)
            db.add(c)
            await db.flush()
            cat_map[name] = c

        for p in PRODUCTS:
            print(f"→ {p['name']}")
            b64 = fetch_b64(p["image_url"])
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
            if b64:
                db.add(M.ProductImage(
                    product_id=prod.id,
                    data_base64=b64,
                    mime_type="image/png",
                    is_primary=True,
                ))
            # Sizes S/M/L/XL with sensible stock
            for size, stock in [("S", 8), ("M", 14), ("L", 12), ("XL", 6)]:
                v = M.Variant(
                    product_id=prod.id,
                    size=size,
                    color=p["color"],
                    color_hex=p["color_hex"],
                )
                db.add(v)
                await db.flush()
                db.add(M.Inventory(variant_id=v.id, store_id=store.id, quantity=stock))

        await db.commit()
        print("✓ Polo catalog seeded.")


if __name__ == "__main__":
    asyncio.run(main())
