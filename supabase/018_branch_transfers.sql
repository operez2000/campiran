-- ==============================================================================
-- Migración 017: Sistema de Traspasos de Mercancía entre Sucursales
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Secuencia para folio consecutivo de traspasos
CREATE SEQUENCE IF NOT EXISTS public.branch_transfers_folio_seq START 1;

-- 2. Tabla principal de Traspasos entre Sucursales (branch_transfers)
CREATE TABLE IF NOT EXISTS public.branch_transfers (
  id_transfer uuid NOT NULL DEFAULT gen_random_uuid(),
  folio integer NOT NULL DEFAULT nextval('public.branch_transfers_folio_seq'::regclass),
  id_origin_store uuid NOT NULL REFERENCES public.stores(id_store) ON DELETE RESTRICT,
  id_origin_location uuid REFERENCES public.locations(id_location) ON DELETE SET NULL,
  id_dest_store uuid NOT NULL REFERENCES public.stores(id_store) ON DELETE RESTRICT,
  id_dest_location uuid REFERENCES public.locations(id_location) ON DELETE SET NULL,
  transfer_mode text NOT NULL DEFAULT 'TRANSIT', -- 'TRANSIT' (En Tránsito -> Recibido) | 'DIRECT' (Directo inmediato)
  status text NOT NULL DEFAULT 'IN_TRANSIT',     -- 'IN_TRANSIT' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED'
  record_status character DEFAULT 'A'::bpchar,   -- 'A' Activo | 'I' Inactivo (Eliminación lógica)
  id_sent_by uuid,
  sent_by_name text,
  id_received_by uuid,
  received_by_name text,
  id_cancelled_by uuid,
  cancelled_by_name text,
  total_items integer NOT NULL DEFAULT 0,
  total_quantity_sent numeric NOT NULL DEFAULT 0,
  total_quantity_received numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  notes text,
  reception_notes text,
  cancellation_reason text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_transfers_pkey PRIMARY KEY (id_transfer)
);

-- 3. Tabla de Partidas de Traspaso (branch_transfer_items)
CREATE TABLE IF NOT EXISTS public.branch_transfer_items (
  id_transfer_item uuid NOT NULL DEFAULT gen_random_uuid(),
  id_transfer uuid NOT NULL REFERENCES public.branch_transfers(id_transfer) ON DELETE CASCADE,
  id_item uuid NOT NULL REFERENCES public.items(id_item) ON DELETE RESTRICT,
  quantity_sent numeric NOT NULL DEFAULT 1,
  quantity_received numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  stock_origin_before numeric DEFAULT 0,
  stock_dest_before numeric DEFAULT 0,
  notes text,
  status character DEFAULT 'A'::bpchar, -- 'A' Activo | 'I' Inactivo
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_transfer_items_pkey PRIMARY KEY (id_transfer_item)
);

-- 4. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_branch_transfers_origin_store ON public.branch_transfers(id_origin_store);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_dest_store ON public.branch_transfers(id_dest_store);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_status ON public.branch_transfers(status);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_record_status ON public.branch_transfers(record_status);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_sent_at ON public.branch_transfers(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_branch_transfer_items_transfer ON public.branch_transfer_items(id_transfer);
CREATE INDEX IF NOT EXISTS idx_branch_transfer_items_item ON public.branch_transfer_items(id_item);

-- 5. Habilitar Row Level Security (RLS)
ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfer_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'branch_transfers' AND policyname = 'Permitir todo a usuarios autenticados en branch_transfers'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en branch_transfers"
      ON public.branch_transfers FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'branch_transfer_items' AND policyname = 'Permitir todo a usuarios autenticados en branch_transfer_items'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en branch_transfer_items"
      ON public.branch_transfer_items FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 6. Publicación en Supabase Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_transfers;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_transfer_items;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- 7. Recargar schema de PostgREST
NOTIFY pgrst, 'reload config';
