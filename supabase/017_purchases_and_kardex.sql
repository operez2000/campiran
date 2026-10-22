-- ==============================================================================
-- Migración 017: Sistema de Compras, Cuentas por Pagar y Kardex de Inventario
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Secuencia para folio consecutivo de compras
CREATE SEQUENCE IF NOT EXISTS public.purchases_purchase_number_seq
  START WITH 1001
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- 2. Tabla cabecera de Compras / Órdenes de Compra (purchases)
CREATE TABLE IF NOT EXISTS public.purchases (
  id_purchase uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_number integer NOT NULL DEFAULT nextval('public.purchases_purchase_number_seq'::regclass),
  id_store uuid NOT NULL REFERENCES public.stores(id_store) ON DELETE CASCADE,
  id_location uuid REFERENCES public.locations(id_location) ON DELETE SET NULL,
  id_supplier uuid REFERENCES public.suppliers(id_supplier) ON DELETE SET NULL,
  id_user uuid,
  invoice_number text,
  purchase_date timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  payment_condition text NOT NULL DEFAULT 'CONTADO', -- 'CONTADO' | 'CREDITO'
  payment_method text DEFAULT '01',                  -- Código SAT ('01', '02', '03', '04', '28', '99')
  payment_status text NOT NULL DEFAULT 'PAID',       -- 'PAID' | 'PENDING' | 'PARTIAL'
  credit_days integer NOT NULL DEFAULT 0,
  due_date timestamptz,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  update_item_cost boolean NOT NULL DEFAULT true,
  notes text,
  purchase_status text NOT NULL DEFAULT 'RECEIVED',  -- 'DRAFT' | 'RECEIVED' | 'CANCELLED'
  status character NOT NULL DEFAULT 'A',             -- 'A' Activo | 'I' Inactivo (eliminación lógica)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT purchases_pkey PRIMARY KEY (id_purchase)
);

CREATE INDEX IF NOT EXISTS idx_purchases_store ON public.purchases(id_store);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(id_supplier);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(id_store, status, purchase_status);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON public.purchases(id_store, payment_status);

-- 3. Tabla detalle de partidas de compra (purchase_items)
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id_purchase_item uuid NOT NULL DEFAULT gen_random_uuid(),
  id_purchase uuid NOT NULL REFERENCES public.purchases(id_purchase) ON DELETE CASCADE,
  id_item uuid NOT NULL REFERENCES public.items(id_item) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  previous_cost numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 8,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  stock_before integer DEFAULT 0,
  stock_after integer DEFAULT 0,
  new_price1 numeric,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT purchase_items_pkey PRIMARY KEY (id_purchase_item)
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(id_purchase);
CREATE INDEX IF NOT EXISTS idx_purchase_items_item ON public.purchase_items(id_item);

-- 4. Tabla de pagos / abonos a proveedores (purchase_payments)
CREATE TABLE IF NOT EXISTS public.purchase_payments (
  id_payment uuid NOT NULL DEFAULT gen_random_uuid(),
  id_purchase uuid NOT NULL REFERENCES public.purchases(id_purchase) ON DELETE CASCADE,
  id_store uuid NOT NULL REFERENCES public.stores(id_store) ON DELETE CASCADE,
  id_supplier uuid REFERENCES public.suppliers(id_supplier) ON DELETE SET NULL,
  id_user uuid,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT '03',
  reference text,
  notes text,
  payment_date timestamptz NOT NULL DEFAULT now(),
  status character NOT NULL DEFAULT 'A',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT purchase_payments_pkey PRIMARY KEY (id_payment)
);

CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase ON public.purchase_payments(id_purchase);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_store ON public.purchase_payments(id_store);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_supplier ON public.purchase_payments(id_supplier);

-- 5. Columnas de trazabilidad de Kardex en transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS stock_before integer;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS stock_after integer;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS id_purchase uuid REFERENCES public.purchases(id_purchase) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS id_supplier uuid REFERENCES public.suppliers(id_supplier) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_item_date ON public.transactions(id_store, id_item, date_transaction DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_purchase ON public.transactions(id_purchase);

-- 6. Habilitar Row Level Security (RLS)
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'Permitir todo a usuarios autenticados en purchases'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en purchases"
      ON public.purchases FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'purchase_items' AND policyname = 'Permitir todo a usuarios autenticados en purchase_items'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en purchase_items"
      ON public.purchase_items FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'purchase_payments' AND policyname = 'Permitir todo a usuarios autenticados en purchase_payments'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en purchase_payments"
      ON public.purchase_payments FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 7. Publicación en Supabase Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_items;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_payments;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload config';
