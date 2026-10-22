-- ==============================================================================
-- Migración 020: Asegurar Cliente Único 'Público en General' y Unicidad de RFC
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql
-- ==============================================================================

DO $$
DECLARE
  v_client_id uuid;
BEGIN
  -- 1. Buscar el registro canónico (más antiguo) de 'Público en General' o RFC 'XAXX010101000'
  SELECT id_client
    INTO v_client_id
    FROM public.clients
   WHERE lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) IN ('público en general', 'publico en general')
      OR lower(trim(coalesce(first_name, ''))) IN ('público en general', 'publico en general')
      OR upper(trim(coalesce(rfc, ''))) = 'XAXX010101000'
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
    -- 3. Reasignar referencias de cualquier registro duplicado de 'Público en General' / 'XAXX010101000'
    UPDATE public.orders
       SET id_client = v_client_id
     WHERE id_client IN (
       SELECT id_client
         FROM public.clients
        WHERE id_client <> v_client_id
          AND (
            lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) IN ('público en general', 'publico en general')
            OR lower(trim(coalesce(first_name, ''))) IN ('público en general', 'publico en general')
            OR upper(trim(coalesce(rfc, ''))) = 'XAXX010101000'
          )
     );

    UPDATE public.carts
       SET id_client = v_client_id
     WHERE id_client IN (
       SELECT id_client
         FROM public.clients
        WHERE id_client <> v_client_id
          AND (
            lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) IN ('público en general', 'publico en general')
            OR lower(trim(coalesce(first_name, ''))) IN ('público en general', 'publico en general')
            OR upper(trim(coalesce(rfc, ''))) = 'XAXX010101000'
          )
     );

    UPDATE public.shipping_addresses
       SET id_client = v_client_id
     WHERE id_client IN (
       SELECT id_client
         FROM public.clients
        WHERE id_client <> v_client_id
          AND (
            lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) IN ('público en general', 'publico en general')
            OR lower(trim(coalesce(first_name, ''))) IN ('público en general', 'publico en general')
            OR upper(trim(coalesce(rfc, ''))) = 'XAXX010101000'
          )
     );

    -- 4. Borrar físicamente los registros duplicados de 'Público en General' / 'XAXX010101000'
    DELETE FROM public.clients
     WHERE id_client <> v_client_id
       AND (
         lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) IN ('público en general', 'publico en general')
         OR lower(trim(coalesce(first_name, ''))) IN ('público en general', 'publico en general')
         OR upper(trim(coalesce(rfc, ''))) = 'XAXX010101000'
       );

    -- 5. Asegurar que el registro único tenga el nombre 'Público en General', RFC 'XAXX010101000', tipo Menudeo (1) y estado activo ('A')
    UPDATE public.clients
       SET first_name = 'Público en General',
           last_name = NULL,
           rfc = 'XAXX010101000',
           price_number = 1,
           status = 'A'
     WHERE id_client = v_client_id;
  END IF;

  -- 6. Vincular órdenes existentes sin cliente asignado (id_client IS NULL) a 'Público en General'
  IF v_client_id IS NOT NULL THEN
    UPDATE public.orders
       SET id_client = v_client_id
     WHERE id_client IS NULL;
  END IF;
END $$;

-- 7. Índice único para garantizar que el RFC no se repita en la tabla clients
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_rfc
  ON public.clients (upper(trim(rfc)))
  WHERE rfc IS NOT NULL AND trim(rfc) <> '';

NOTIFY pgrst, 'reload config';
