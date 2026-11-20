-- ==============================================================================
-- Migración 025: Porcentaje de comisión por pago con tarjeta en configuración
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar columna card_commission_pct a public.company_settings (default 4.00%)
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS card_commission_pct numeric(5,2) NOT NULL DEFAULT 4.00;

-- 2. Asegurar valor 4.00% en registros existentes que pudieran quedar en NULL
UPDATE public.company_settings
SET card_commission_pct = 4.00
WHERE card_commission_pct IS NULL;

-- 3. Comentario descriptivo
COMMENT ON COLUMN public.company_settings.card_commission_pct IS 'Porcentaje de comisión por pago con tarjeta de crédito/débito (default 4.00%)';

-- 4. Recargar esquema de PostgREST
NOTIFY pgrst, 'reload config';
