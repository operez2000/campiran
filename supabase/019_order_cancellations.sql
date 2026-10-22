-- ==============================================================================
-- Migración 019: Cancelaciones de Ventas en Punto de Venta (POS)
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar columnas de auditoría de cancelación a la tabla orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_auth_method text; -- 'pin' | 'webauthn' | 'face' | 'biometric'

-- 2. Índices para acelerar búsquedas de ventas por tienda, estatus y fecha
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON public.orders(id_store, status);
CREATE INDEX IF NOT EXISTS idx_orders_store_created_at ON public.orders(id_store, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);

-- 3. Notificar recarga de schema a PostgREST
NOTIFY pgrst, 'reload config';
