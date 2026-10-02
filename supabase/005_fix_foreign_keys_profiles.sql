-- Migration 005: Update foreign keys from deprecated `users` table to `profiles`
-- Run in: https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- Date: 2026-10-01

-- 1. inventory_sessions: update id_user foreign key to profiles(id)
ALTER TABLE public.inventory_sessions 
  DROP CONSTRAINT IF EXISTS inventory_sessions_id_user_fkey;

ALTER TABLE public.inventory_sessions 
  ADD CONSTRAINT inventory_sessions_id_user_fkey 
  FOREIGN KEY (id_user) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. inventory_readings: update id_user foreign key to profiles(id)
ALTER TABLE public.inventory_readings 
  DROP CONSTRAINT IF EXISTS inventory_readings_id_user_fkey;

ALTER TABLE public.inventory_readings 
  ADD CONSTRAINT inventory_readings_id_user_fkey 
  FOREIGN KEY (id_user) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. transactions: update id_user foreign key if exists
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_id_user_fkey;

ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_id_user_fkey 
  FOREIGN KEY (id_user) REFERENCES public.profiles(id) ON DELETE SET NULL;
