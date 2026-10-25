-- Migration 022: Physical Inventory Enhancements
-- 1. Adds pre_inventory_stock, last_inventory_reset_at, and last_inventory_reset_by to public.stocks
-- 2. Adds stored procedure reset_store_inventory_to_zero to atomically snapshot and reset stock for a branch
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql)

-- ============================================================
-- 1. Add columns to public.stocks
-- ============================================================
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS pre_inventory_stock integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_inventory_reset_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_inventory_reset_by uuid;

-- Optional index to accelerate store inventory queries
CREATE INDEX IF NOT EXISTS idx_stocks_store_item ON public.stocks(id_store, id_item);

-- ============================================================
-- 2. Function to atomically snapshot pre_inventory_stock and reset current stock to 0 for a store
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_store_inventory_to_zero(
  p_store_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer := 0;
  v_inserted_count integer := 0;
  v_default_location uuid;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'p_store_id is required';
  END IF;

  -- Find a default location for this store
  SELECT id_location INTO v_default_location
  FROM public.locations
  WHERE id_store = p_store_id AND status = 'A'
  ORDER BY description ASC
  LIMIT 1;

  -- 1. Snapshot current stock into pre_inventory_stock and reset current to 0 for all existing stock records in this store
  UPDATE public.stocks
  SET 
    pre_inventory_stock = COALESCE(current, 0),
    previous = COALESCE(current, 0),
    current = 0,
    last_inventory_reset_at = now(),
    last_inventory_reset_by = p_user_id
  WHERE id_store = p_store_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- 2. Ensure all active catalog items have a stock record initialized for this store
  IF v_default_location IS NOT NULL THEN
    INSERT INTO public.stocks (
      id_item, 
      id_store, 
      id_location, 
      current, 
      initial, 
      previous, 
      pre_inventory_stock, 
      last_inventory_reset_at, 
      last_inventory_reset_by
    )
    SELECT 
      i.id_item, 
      p_store_id, 
      v_default_location, 
      0, 
      0, 
      0, 
      0, 
      now(), 
      p_user_id
    FROM public.items i
    WHERE i.status = 'A'
      AND NOT EXISTS (
        SELECT 1 FROM public.stocks s 
        WHERE s.id_item = i.id_item AND s.id_store = p_store_id
      );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END IF;

  -- 3. Audit entry in transactions table
  INSERT INTO public.transactions (
    id_store,
    id_location,
    id_user,
    movim_type,
    amount_enrty,
    amount_exit,
    concept,
    origin,
    comments
  ) VALUES (
    p_store_id,
    v_default_location,
    p_user_id,
    'I',
    0,
    0,
    'Reinicio de existencias a cero para inventario físico',
    'Inventario Físico',
    format('Existencias puestas a 0. Actualizados: %s registros, Inicializados: %s registros nuevos', v_updated_count, v_inserted_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated_count,
    'inserted', v_inserted_count,
    'timestamp', now()
  );
END;
$$;
