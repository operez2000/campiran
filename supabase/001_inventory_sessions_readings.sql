-- Migration: Create inventory_sessions and inventory_readings tables
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql)
-- Date: 2026-05-13

-- ============================================================
-- 1. inventory_sessions — Groups physical inventory readings
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_sessions (
  id_session uuid NOT NULL DEFAULT gen_random_uuid(),
  id_store uuid,
  id_user uuid,
  status character DEFAULT 'A'::bpchar,  -- A=Abierta, C=Cerrada
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  CONSTRAINT inventory_sessions_pkey PRIMARY KEY (id_session),
  CONSTRAINT inventory_sessions_id_store_fkey FOREIGN KEY (id_store) REFERENCES stores(id_store),
  CONSTRAINT inventory_sessions_id_user_fkey FOREIGN KEY (id_user) REFERENCES users(id_user)
);

-- ============================================================
-- 2. inventory_readings — Each individual scan/reading
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_readings (
  id_reading uuid NOT NULL DEFAULT gen_random_uuid(),
  id_session uuid,
  id_item uuid,
  id_store uuid,
  id_location uuid,
  id_user uuid,
  quantity integer DEFAULT 1,
  stock_before integer DEFAULT 0,     -- stocks.current at time of scan (system stock)
  stock_physical integer DEFAULT 0,   -- accumulated physical count for this item in the session
  stock_diff integer DEFAULT 0,       -- stock_physical - stock_before
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_readings_pkey PRIMARY KEY (id_reading),
  CONSTRAINT inventory_readings_id_session_fkey FOREIGN KEY (id_session) REFERENCES inventory_sessions(id_session),
  CONSTRAINT inventory_readings_id_item_fkey FOREIGN KEY (id_item) REFERENCES items(id_item),
  CONSTRAINT inventory_readings_id_store_fkey FOREIGN KEY (id_store) REFERENCES stores(id_store),
  CONSTRAINT inventory_readings_id_location_fkey FOREIGN KEY (id_location) REFERENCES locations(id_location),
  CONSTRAINT inventory_readings_id_user_fkey FOREIGN KEY (id_user) REFERENCES users(id_user)
);

-- ============================================================
-- 3. Enable RLS (Row Level Security) — same pattern as other tables
-- ============================================================
ALTER TABLE inventory_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_readings ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (same as other tables in this project)
CREATE POLICY "Allow all for authenticated users" ON inventory_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON inventory_readings
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Enable Realtime for both tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_readings;
