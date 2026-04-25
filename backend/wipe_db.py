"""One-shot script to drop ALL tables in the public schema for a clean reset."""
import asyncio
from sqlalchemy import text
from database import engine


async def wipe():
    async with engine.begin() as conn:
        # Drop all tables in public schema
        await conn.execute(text("DROP SCHEMA public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO postgres;"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
    print("Database wiped clean. All public tables dropped.")


if __name__ == "__main__":
    asyncio.run(wipe())
