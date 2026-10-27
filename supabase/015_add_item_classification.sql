-- ==============================================================================
-- Migración 015: Agregar campo classification (Regular o Pieza Técnica) en items
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar columna classification a la tabla items
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'REGULAR';

-- 2. Asegurar que registros existentes tengan el valor predeterminado 'REGULAR'
UPDATE public.items
SET classification = 'REGULAR'
WHERE classification IS NULL;

-- 3. Crear índice para optimizar filtros y ordenamientos por clasificación
CREATE INDEX IF NOT EXISTS idx_items_classification ON public.items(classification);

-- 4. Comentario explicativo
COMMENT ON COLUMN public.items.classification IS 'Clasificación del artículo en catálogo: REGULAR o FICHA_TECNICA';
