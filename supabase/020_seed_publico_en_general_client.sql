-- ==============================================================================
-- Migración 020: Asegurar Cliente Predeterminado 'Público en General' en Catálogo
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

DO $$
DECLARE
  v_client_id uuid;
BEGIN
  -- 1. Buscar si ya existe un cliente llamado 'Público en General' (con o sin acento)
  SELECT id_client
    INTO v_client_id
    FROM public.clients
   WHERE lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) IN ('público en general', 'publico en general')
      OR lower(trim(coalesce(first_name, ''))) IN ('público en general', 'publico en general')
   ORDER BY created_at ASC
   LIMIT 1;

  -- 2. Si no existe, insertarlo con RFC genérico XAXX010101000 y tipo Menudeo (price_number = 1)
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (
      first_name,
      last_name,
      rfc,
      country,
      price_number,
      status,
      comments
    ) VALUES (
      'Público en General',
      NULL,
      'XAXX010101000',
      'México',
      1, -- Menudeo (Precio 1)
      'A',
      'Cliente predeterminado para ventas de mostrador (Menudeo)'
    )
    RETURNING id_client INTO v_client_id;
  ELSE
    -- 3. Si ya existe, asegurar que tenga el nombre 'Público en General', RFC 'XAXX010101000', tipo Menudeo (1) y estado activo ('A')
    UPDATE public.clients
       SET first_name = 'Público en General',
           last_name = NULL,
           rfc = 'XAXX010101000',
           price_number = 1,
           status = 'A'
     WHERE id_client = v_client_id;
  END IF;

  -- 4. Vincular órdenes existentes sin cliente asignado (id_client IS NULL) a 'Público en General'
  IF v_client_id IS NOT NULL THEN
    UPDATE public.orders
       SET id_client = v_client_id
     WHERE id_client IS NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload config';
