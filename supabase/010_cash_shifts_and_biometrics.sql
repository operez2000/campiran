-- Migration 010: Cash Shifts (Apertura y Cierre de Caja Bimoneda) and User Biometrics (WebAuthn / Face Detection)
-- Run in Supabase SQL Editor if needed:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql

-- 1. Tabla de Turnos / Jornadas de Caja (cash_shifts)
CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id_shift uuid NOT NULL DEFAULT gen_random_uuid(),
  id_store uuid REFERENCES public.stores(id_store) ON DELETE CASCADE,
  id_user uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  initial_cash_mxn numeric NOT NULL DEFAULT 0,
  initial_cash_usd numeric NOT NULL DEFAULT 0,
  exchange_rate numeric NOT NULL DEFAULT 19.00,
  final_cash_mxn numeric,
  final_cash_usd numeric,
  status text NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  notes text,
  auth_method text DEFAULT 'biometric', -- 'webauthn' | 'face' | 'pin' | 'biometric'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT cash_shifts_pkey PRIMARY KEY (id_shift)
);

-- Índices para búsqueda rápida de turnos abiertos
CREATE INDEX IF NOT EXISTS idx_cash_shifts_store_status ON public.cash_shifts(id_store, status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_user_status ON public.cash_shifts(id_user, status);

-- 2. Tabla de Credenciales Biométricas y Acceso de Cajero (user_biometrics)
CREATE TABLE IF NOT EXISTS public.user_biometrics (
  id_biometric uuid NOT NULL DEFAULT gen_random_uuid(),
  id_user uuid NOT NULL UNIQUE,
  cashier_number text,
  cashier_pin text,
  has_webauthn boolean NOT NULL DEFAULT false,
  webauthn_credential jsonb, -- ID de credencial, clave pública, transports
  has_face boolean NOT NULL DEFAULT false,
  face_photo_url text,      -- Foto de referencia facial
  face_descriptor jsonb,    -- Puntos o vector de reconocimiento facial
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT user_biometrics_pkey PRIMARY KEY (id_biometric)
);

CREATE INDEX IF NOT EXISTS idx_user_biometrics_user ON public.user_biometrics(id_user);

-- 3. Columnas de Bimoneda y Pagos SAT en Orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS id_shift uuid REFERENCES public.cash_shifts(id_shift);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_sat_code text DEFAULT '01';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_breakdown jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 19.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cash_received_mxn numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cash_received_usd numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS change_mxn numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS change_usd numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;

-- 4. Habilitar RLS
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_biometrics ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para usuarios autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_shifts' AND policyname = 'Permitir todo a usuarios autenticados en cash_shifts'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en cash_shifts"
      ON public.cash_shifts FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_biometrics' AND policyname = 'Permitir todo a usuarios autenticados en user_biometrics'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en user_biometrics"
      ON public.user_biometrics FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 5. Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_shifts;
  EXCEPTION WHEN OTHERS THEN
    -- Ya existe en publication
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_biometrics;
  EXCEPTION WHEN OTHERS THEN
    -- Ya existe en publication
    NULL;
  END;
END $$;

-- 6. Notificar recarga de schema a PostgREST
NOTIFY pgrst, 'reload config';
