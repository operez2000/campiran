-- Migration 007: Add foreign keys for transactions table
-- Run in Supabase SQL Editor if you want database-level foreign key constraints:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql

-- 1. Foreign key to items
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_id_item_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_id_item_fkey
  FOREIGN KEY (id_item) REFERENCES public.items(id_item) ON DELETE SET NULL;

-- 2. Foreign key to locations
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_id_location_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_id_location_fkey
  FOREIGN KEY (id_location) REFERENCES public.locations(id_location) ON DELETE SET NULL;

-- 3. Foreign key to stores
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_id_store_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_id_store_fkey
  FOREIGN KEY (id_store) REFERENCES public.stores(id_store) ON DELETE CASCADE;
