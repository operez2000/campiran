-- ==============================================================================
-- Migración 024: Gestión de comisiones en ventas (Vendedores y Técnicos)
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Agregar porcentajes de comisión a public.profiles o public.users (según cuál exista)
DO $$
BEGIN
  -- Si existe public.profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS sales_commission_pct numeric(5,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS service_commission_pct numeric(5,2) NOT NULL DEFAULT 0.00;
  END IF;

  -- Si existe public.users
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS sales_commission_pct numeric(5,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS service_commission_pct numeric(5,2) DEFAULT 0.00;
  END IF;
END $$;

-- 2. Agregar campos de comisión a public.orders (Snapshot inalterable por venta)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS id_seller uuid,
ADD COLUMN IF NOT EXISTS id_technician uuid,
ADD COLUMN IF NOT EXISTS products_subtotal numeric(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS services_subtotal numeric(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS seller_commission_pct numeric(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS seller_commission_amount numeric(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS technician_commission_pct numeric(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS technician_commission_amount numeric(12,2) NOT NULL DEFAULT 0.00;

-- 3. Foreign keys inteligentes (enlaza a profiles o a users según la tabla activa)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'orders_id_seller_fkey' AND table_name = 'orders') THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_id_seller_fkey FOREIGN KEY (id_seller) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'orders_id_technician_fkey' AND table_name = 'orders') THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_id_technician_fkey FOREIGN KEY (id_technician) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'orders_id_seller_fkey' AND table_name = 'orders') THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_id_seller_fkey FOREIGN KEY (id_seller) REFERENCES public.users(id_user) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'orders_id_technician_fkey' AND table_name = 'orders') THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_id_technician_fkey FOREIGN KEY (id_technician) REFERENCES public.users(id_user) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- 4. Índices de consulta para reportes rápidos de comisiones
CREATE INDEX IF NOT EXISTS idx_orders_id_seller ON public.orders(id_seller);
CREATE INDEX IF NOT EXISTS idx_orders_id_technician ON public.orders(id_technician);
CREATE INDEX IF NOT EXISTS idx_orders_commission_dates ON public.orders(created_at, status);
