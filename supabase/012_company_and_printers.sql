-- ==============================================================================
-- Migración 012: Configuración de Empresa Global y Configuración de Impresoras (QZ Tray)
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

-- 1. Tabla de Configuración de Empresa (Global / Multi-sucursal)
CREATE TABLE IF NOT EXISTS public.company_settings (
  id_company uuid NOT NULL DEFAULT gen_random_uuid(),
  legal_name text,                      -- Razón Social (ej. "Campiran Alimentos S.A. de C.V.")
  trade_name text,                      -- Nombre Comercial (ej. "Campiran")
  rfc text,                             -- RFC (ej. "CAM200101XYZ")
  tax_regime text,                      -- Régimen Fiscal (ej. "601 - General de Ley Personas Morales")
  tax_regime_code text,                 -- Clave SAT régimen (ej. "601")
  street text,                          -- Calle
  exterior_number text,                 -- No. Exterior
  interior_number text,                 -- No. Interior
  neighborhood text,                    -- Colonia
  postal_code text,                     -- Código Postal
  city text,                            -- Ciudad / Municipio
  state text,                           -- Estado
  country text DEFAULT 'México',        -- País
  phone text,                           -- Teléfono de contacto
  email text,                           -- Correo de facturación / contacto
  website text,                         -- Sitio web oficial
  logo_url text,                        -- URL del logo (máx 720px)
  ticket_footer_message text,           -- Mensaje al pie de ticket (ej. "¡Gracias por su compra!")
  qz_cert text,                         -- Certificado digital para QZ Tray (opcional)
  qz_private_key text,                  -- Clave privada para QZ Tray (opcional)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT company_settings_pkey PRIMARY KEY (id_company)
);

-- Asegurar al menos un registro inicial para la empresa
INSERT INTO public.company_settings (id_company, trade_name, legal_name, rfc, country)
SELECT gen_random_uuid(), 'Campiran', 'Campiran S.A. de C.V.', 'XAXX010101000', 'México'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);

-- 2. Tabla de Impresoras de Recibos por Sucursal (QZ Tray / ESC/POS)
CREATE TABLE IF NOT EXISTS public.branch_printers (
  id_printer uuid NOT NULL DEFAULT gen_random_uuid(),
  id_store uuid NOT NULL REFERENCES public.stores(id_store) ON DELETE CASCADE,
  name text NOT NULL,                   -- Nombre identificador (ej. "Impresora Mostrador", "Caja 1")
  connection_type text NOT NULL DEFAULT 'network', -- 'network' (IP) | 'bluetooth'
  ip_address text,                      -- Dirección IP (ej. "192.168.1.100")
  ip_port integer DEFAULT 9100,         -- Puerto RAW (ej. 9100)
  bluetooth_name text,                  -- Nombre o MAC Bluetooth (ej. "MTP-II" o "00:11:22:33:44:55")
  paper_width integer DEFAULT 80,       -- 80mm o 58mm
  characters_per_line integer DEFAULT 48, -- 48 (80mm) o 32 (58mm)
  cut_paper boolean DEFAULT true,       -- Enviar comando de corte de papel
  open_cash_drawer boolean DEFAULT true,-- Enviar comando de apertura de cajón
  is_default boolean DEFAULT false,     -- Impresora predeterminada para la sucursal
  status character DEFAULT 'A',         -- 'A' Activo | 'I' Inactivo (eliminación lógica)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT branch_printers_pkey PRIMARY KEY (id_printer)
);

CREATE INDEX IF NOT EXISTS idx_branch_printers_store ON public.branch_printers(id_store);
CREATE INDEX IF NOT EXISTS idx_branch_printers_status ON public.branch_printers(status);

-- 3. Bucket de Storage para Logo de la Empresa
INSERT INTO storage.buckets (id, name, public)
VALUES ('company', 'company', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de storage para bucket 'company'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public Access for company bucket' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Public Access for company bucket"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'company');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated write for company bucket' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated write for company bucket"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'company');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated update for company bucket' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated update for company bucket"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'company');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated delete for company bucket' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated delete for company bucket"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'company');
  END IF;
END $$;

-- 4. Habilitar RLS en company_settings y branch_printers
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_printers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'Permitir todo a autenticados en company_settings'
  ) THEN
    CREATE POLICY "Permitir todo a autenticados en company_settings"
      ON public.company_settings FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'branch_printers' AND policyname = 'Permitir todo a autenticados en branch_printers'
  ) THEN
    CREATE POLICY "Permitir todo a autenticados en branch_printers"
      ON public.branch_printers FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 5. Realtime para company_settings y branch_printers
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.company_settings;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_printers;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload config';
