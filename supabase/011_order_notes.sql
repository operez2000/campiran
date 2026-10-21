-- ==============================================================================
-- Migración 011: Agregar columna de Observaciones / Notas en Orders
-- ==============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
