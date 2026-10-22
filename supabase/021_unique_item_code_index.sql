-- ==============================================================================
-- Migración 021: Índice Único para Código Interno en Artículos Activos
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Crear índice único parcial en items(code) solo para artículos activos ('A') con código no nulo
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_code_active_unique
ON public.items (code)
WHERE status = 'A' AND code IS NOT NULL AND trim(code) != '';

-- 2. Comentario descriptivo
COMMENT ON INDEX public.idx_items_code_active_unique IS 'Garantiza unicidad de códigos internos entre artículos activos para prevenir colisiones en altas concurrentes';
