-- Migration 006: RLS Policies and Realtime for clients and suppliers
-- Run in: https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- Date: 2026-10-01

-- 1. Enable RLS and grant read/write access to authenticated users for clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to clients" ON public.clients;
CREATE POLICY "Allow authenticated full access to clients" ON public.clients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Enable RLS and grant read/write access to authenticated users for suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to suppliers" ON public.suppliers;
CREATE POLICY "Allow authenticated full access to suppliers" ON public.suppliers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Publish tables to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
