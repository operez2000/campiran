-- ==============================================================================
-- Migración 023: Renumeración de artículos con código/código de barras 00000000000008
-- Asigna el siguiente código consecutivo disponible en la secuencia global de 14 dígitos
-- ==============================================================================

DO $$
DECLARE
  v_next_val bigint;
  v_new_code text;
  r RECORD;
BEGIN
  -- 1. Calcular el valor máximo actual entre los códigos numéricos de 14 dígitos
  SELECT COALESCE(MAX(code::bigint), 0)
  INTO v_next_val
  FROM public.items
  WHERE code ~ '^\d{14}$';

  -- 2. Renumerar cualquier registro que tenga 00000000000008 en código interno y código de barras
  FOR r IN (
    SELECT id_item, description
    FROM public.items
    WHERE code = '00000000000008' AND barcode = '00000000000008'
    ORDER BY created_at ASC
  ) LOOP
    v_next_val := v_next_val + 1;
    v_new_code := lpad(v_next_val::text, 14, '0');

    UPDATE public.items
    SET code = v_new_code,
        barcode = v_new_code
    WHERE id_item = r.id_item;

    RAISE NOTICE 'Item % (%) renumbered to %', r.id_item, r.description, v_new_code;
  END LOOP;
END $$;
