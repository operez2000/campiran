-- Migration 013: Employee Attendance System (Check-In & Check-Out)
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql

-- 1. Tabla de Asistencia de Empleados (employee_attendance)
CREATE TABLE IF NOT EXISTS public.employee_attendance (
  id_attendance uuid NOT NULL DEFAULT gen_random_uuid(),
  id_user uuid NOT NULL, -- UUID del usuario (compatible con auth.users, public.users y public.profiles)
  id_store uuid NOT NULL REFERENCES public.stores(id_store) ON DELETE CASCADE,
  check_in timestamptz NOT NULL DEFAULT now(),
  check_out timestamptz,
  total_minutes numeric DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  auth_method text DEFAULT 'session', -- 'session' | 'pin'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT employee_attendance_pkey PRIMARY KEY (id_attendance)
);

-- Índices para optimizar consultas por tienda, usuario, fecha y estado
CREATE INDEX IF NOT EXISTS idx_employee_attendance_user ON public.employee_attendance(id_user);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_store ON public.employee_attendance(id_store);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_status ON public.employee_attendance(status);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_check_in ON public.employee_attendance(check_in);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_user_status ON public.employee_attendance(id_user, status);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_store_date ON public.employee_attendance(id_store, check_in);

-- 2. Habilitar RLS
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'employee_attendance' AND policyname = 'Permitir todo a usuarios autenticados en employee_attendance'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en employee_attendance"
      ON public.employee_attendance FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 3. Habilitar Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_attendance;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- 4. Notificar recarga de schema a PostgREST
NOTIFY pgrst, 'reload config';
