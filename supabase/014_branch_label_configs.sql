-- ==============================================================================
-- Migración 014: Configuración de Impresión de Etiquetas con Código de Barras por Sucursal
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.branch_label_configs (
  id_config uuid NOT NULL DEFAULT gen_random_uuid(),
  id_store uuid NOT NULL REFERENCES public.stores(id_store) ON DELETE CASCADE,
  name text NOT NULL,                                -- Nombre identificador (ej. "Zebra 2x1 in", "Estándar Anaquel 50x25mm")
  printer_brand text NOT NULL DEFAULT 'Zebra',       -- 'Zebra' | 'Brother' | 'Dymo' | 'Xprinter' | 'TSC' | 'Avery' | 'Personalizada'
  printer_model text DEFAULT 'ZD220',                -- Modelo de impresora o plantilla
  unit text NOT NULL DEFAULT 'cm',                   -- 'cm' (centímetros) | 'in' (pulgadas)
  label_width numeric NOT NULL DEFAULT 5.0,          -- Ancho de la etiqueta en la unidad elegida
  label_height numeric NOT NULL DEFAULT 2.5,         -- Alto de la etiqueta en la unidad elegida
  labels_per_row integer NOT NULL DEFAULT 1,         -- Cantidad de etiquetas por renglón (columnas: 1, 2, 3...)
  gap_x numeric NOT NULL DEFAULT 0.0,                -- Espacio entre etiquetas entre columnas (cuando son > 1 en un renglón)
  gap_y numeric NOT NULL DEFAULT 0.3,                -- Espacio entre cada renglón
  margin_top numeric DEFAULT 0.0,                    -- Margen superior de página/rollo
  margin_left numeric DEFAULT 0.0,                   -- Margen izquierdo de página/rollo
  page_width numeric,                                -- Ancho de página en caso de hojas fijas (ej. Carta / A4)
  page_height numeric,                               -- Alto de página en caso de hojas fijas
  include_item_name boolean NOT NULL DEFAULT true,   -- Imprimir descripción / nombre del producto
  include_price boolean NOT NULL DEFAULT true,       -- Imprimir precio del producto
  price_to_print text NOT NULL DEFAULT 'price1',     -- 'price1' | 'price2' | 'price3'
  include_code boolean NOT NULL DEFAULT true,        -- Imprimir código interno del producto
  include_barcode boolean NOT NULL DEFAULT true,     -- Imprimir código de barras
  include_store_name boolean NOT NULL DEFAULT false, -- Imprimir nombre de la sucursal / empresa
  barcode_type text NOT NULL DEFAULT 'CODE128',      -- 'CODE128' | 'EAN13'
  is_default boolean NOT NULL DEFAULT false,         -- Plantilla predeterminada de la sucursal
  status character NOT NULL DEFAULT 'A',             -- 'A' Activo | 'I' Inactivo (eliminación lógica)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT branch_label_configs_pkey PRIMARY KEY (id_config)
);

CREATE INDEX IF NOT EXISTS idx_branch_label_configs_store ON public.branch_label_configs(id_store);
CREATE INDEX IF NOT EXISTS idx_branch_label_configs_status ON public.branch_label_configs(status);
CREATE INDEX IF NOT EXISTS idx_branch_label_configs_default ON public.branch_label_configs(id_store, is_default) WHERE status = 'A';

-- Habilitar RLS
ALTER TABLE public.branch_label_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'branch_label_configs' AND policyname = 'Permitir todo a autenticados en branch_label_configs'
  ) THEN
    CREATE POLICY "Permitir todo a autenticados en branch_label_configs"
      ON public.branch_label_configs FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Habilitar Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_label_configs;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload config';
