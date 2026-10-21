-- ==============================================================================
-- Migración 016: Geolocalización y Geocerca de Sucursales
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar columnas de geolocalización a la tabla stores
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS latitude numeric(10, 7),
ADD COLUMN IF NOT EXISTS longitude numeric(10, 7),
ADD COLUMN IF NOT EXISTS geofence_radius integer DEFAULT 150; -- Radio de tolerancia en metros

-- 2. Índices para acelerar búsquedas por coordenadas
CREATE INDEX IF NOT EXISTS idx_stores_coordinates 
ON public.stores(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 3. Comentarios explicativos
COMMENT ON COLUMN public.stores.latitude IS 'Latitud GPS de la sucursal en grados decimales (WGS84)';
COMMENT ON COLUMN public.stores.longitude IS 'Longitud GPS de la sucursal en grados decimales (WGS84)';
COMMENT ON COLUMN public.stores.geofence_radius IS 'Radio de geocerca en metros para detección de presencia del usuario (default 150m)';

-- 4. Notificar recarga de schema a PostgREST
NOTIFY pgrst, 'reload config';
