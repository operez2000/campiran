-- ==============================================================================
-- Migración 027: Campos de comisión por pago con tarjeta en orders
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar columnas de trazabilidad de comisión por tarjeta en public.orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS is_card_payment boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS card_commission_pct numeric(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS card_commission_amount numeric(12,2) NOT NULL DEFAULT 0.00;

-- 2. Comentarios descriptivos
COMMENT ON COLUMN public.orders.is_card_payment IS 'Indica si la venta fue marcada con pago por tarjeta (Crédito 04 / Débito 28)';
COMMENT ON COLUMN public.orders.card_commission_pct IS 'Porcentaje de comisión por tarjeta aplicado en la venta (snapshot)';
COMMENT ON COLUMN public.orders.card_commission_amount IS 'Importe total de comisión por tarjeta incluido en el precio final de los productos';

-- 3. Recargar esquema de PostgREST
NOTIFY pgrst, 'reload config';
