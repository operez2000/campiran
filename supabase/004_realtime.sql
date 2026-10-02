-- Migration 004: Enable Realtime for core operational tables
-- Run in: https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- Date: 2026-10-01

-- Enable Realtime for tables that need live updates
-- (inventory_sessions and inventory_readings are already published in 001)

ALTER PUBLICATION supabase_realtime ADD TABLE public.stocks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
