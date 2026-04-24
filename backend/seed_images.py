"""Generate AI images for featured products. Run once after seed.py."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from database import AsyncSessionLocal
from sqlalchemy import select
import models as M
from image_gen import generate_tshirt_image


PROMPTS = {
    "OBSIDIAN CORE TEE": "matte black heavyweight cotton oversized boxy tee, clean front shot, soft studio rim lighting on a dark concrete surface, monochrome aesthetic",
    "BLOODLINE GRAPHIC TEE": "black oversized streetwear tee with a bold abstract red hand-drawn graphic on chest, concrete backdrop, dramatic moody lighting",
    "GRID LONGSLEEVE": "dark olive drop-shoulder long-sleeve tee, flat lay on dark concrete surface, minimal editorial styling, industrial aesthetic",
    "UNDERWORLD HOODIE": "heavyweight black fleece hoodie with kangaroo pocket, product shot flat lay on dark concrete, sharp shadows, editorial streetwear",
    "SIGNAL FLARE TEE": "black cotton tee with a small safety-orange heat transfer graphic on chest, flat lay on dark concrete, moody studio lighting",
    "RAW CUT PREMIUM": "stone-colored garment-dyed raw-edge cotton tee, textural close-up on dark surface, editorial minimal streetwear aesthetic",
}


async def main():
    async with AsyncSessionLocal() as db:
        prods = (await db.execute(select(M.Product))).scalars().all()
        for p in prods:
            existing = (await db.execute(select(M.ProductImage).where(M.ProductImage.product_id == p.id))).scalars().all()
            if existing:
                print(f"Skip (has images): {p.name}")
                continue
            prompt = PROMPTS.get(p.name, f"editorial streetwear tee flat lay, {p.name}")
            print(f"→ Generating: {p.name}")
            b64 = await generate_tshirt_image(prompt)
            if not b64:
                print(f"  ✗ failed")
                continue
            img = M.ProductImage(
                product_id=p.id,
                data_base64=b64,
                mime_type="image/png",
                is_primary=True,
            )
            db.add(img)
            await db.commit()
            print(f"  ✓ saved image for {p.name}")


if __name__ == "__main__":
    asyncio.run(main())
