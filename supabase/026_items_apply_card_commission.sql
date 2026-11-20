-- ==============================================================================
-- Migración 026: Opción en productos para aplicar comisión por pago con tarjeta
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar columna apply_card_commission a public.items (default false)
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS apply_card_commission boolean NOT NULL DEFAULT false;

-- 2. Asegurar valor false en registros existentes que pudieran quedar en NULL
UPDATE public.items
SET apply_card_commission = false
WHERE apply_card_commission IS NULL;

-- 3. Índice para consultas rápidas si se requiere filtrar
CREATE INDEX IF NOT EXISTS idx_items_apply_card_commission
  ON public.items(apply_card_commission);

-- 4. Comentario descriptivo
COMMENT ON COLUMN public.items.apply_card_commission IS 'Indica si el producto incrementa la comisión configurada al pagar con tarjeta (Crédito 04 / Débito 28) en el POS';

-- 5. Recargar esquema de PostgREST
NOTIFY pgrst, 'reload config';
