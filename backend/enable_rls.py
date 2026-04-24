"""Enable Row Level Security on every public table with a default-deny stance.

Strategy:
  - ENABLE ROW LEVEL SECURITY on every table in schema public.
  - FORCE ROW LEVEL SECURITY so even table owners honour policies (except BYPASSRLS).
  - Drop any prior policies we manage, then create two explicit policies per table:
      * service_role_all — full access for Supabase service_role (used by any
        future trusted server that connects with the service_role key).
      * deny_public      — no access for anon or authenticated roles (Supabase
        REST / supabase-js clients). USING clause returns false always.
  - Our FastAPI backend connects as the `postgres` superuser role via the
    Transaction Pooler, which bypasses RLS automatically. Nothing in the app
    needs to change.

Run:  python enable_rls.py
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from database import engine


async def main():
    async with engine.begin() as conn:
        # List every table in schema public
        rows = (await conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        ))).fetchall()
        tables = [r[0] for r in rows]
        print(f"Found {len(tables)} public tables:")
        for t in tables:
            print(f"  - {t}")

        for t in tables:
            print(f"→ securing {t}")
            # Enable + force RLS
            await conn.execute(text(f'ALTER TABLE public."{t}" ENABLE ROW LEVEL SECURITY;'))
            await conn.execute(text(f'ALTER TABLE public."{t}" FORCE ROW LEVEL SECURITY;'))

            # Drop any prior managed policies so this script is idempotent
            await conn.execute(text(f'DROP POLICY IF EXISTS service_role_all ON public."{t}";'))
            await conn.execute(text(f'DROP POLICY IF EXISTS deny_public     ON public."{t}";'))

            # Full access for service_role (trusted server key)
            await conn.execute(text(
                f'CREATE POLICY service_role_all ON public."{t}" '
                f'FOR ALL TO service_role USING (true) WITH CHECK (true);'
            ))

            # Explicit deny for anon + authenticated (PostgREST / supabase-js).
            # USING false + no WITH CHECK means every row is invisible and
            # no row can be written regardless of intent.
            await conn.execute(text(
                f'CREATE POLICY deny_public ON public."{t}" '
                f'FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);'
            ))

        print("\n✓ RLS enabled + default-deny policies applied on", len(tables), "tables.")
        print("  Supabase Advisor should now show 0 critical RLS warnings.")
        print("  The FastAPI backend (postgres superuser) is unaffected — RLS is bypassed for superusers.")


if __name__ == "__main__":
    asyncio.run(main())
