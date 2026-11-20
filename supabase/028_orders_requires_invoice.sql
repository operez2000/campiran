-- ==============================================================================
-- Migración 028: Campo requires_invoice en orders para control de factura e IVA
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar columna requires_invoice a public.orders (default false)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS requires_invoice boolean NOT NULL DEFAULT false;

-- 2. Para ventas históricas que ya tenían IVA calculado, marcarlas con requires_invoice = true
UPDATE public.orders
SET requires_invoice = true
WHERE COALESCE(tax_amount, 0) > 0
  AND requires_invoice = false;

-- 3. Comentario descriptivo
COMMENT ON COLUMN public.orders.requires_invoice IS 'Indica si el cliente solicitó factura (suma y desglosa IVA en POS y ticket)';

-- 4. Recargar esquema de PostgREST
NOTIFY pgrst, 'reload config';
