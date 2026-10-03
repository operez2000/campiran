-- Migration 008: Supabase Storage bucket and RLS policies for item_images
-- Run in Supabase SQL Editor if needed:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql

-- 1. Create storage bucket for item_images if it doesn't already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('item_images', 'item_images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage RLS Policies for item_images bucket
-- Allow public access to view images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public Access for item_images' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Public Access for item_images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'item_images');
  END IF;
END $$;

-- Allow authenticated users to upload, update and delete images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated insert for item_images' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated insert for item_images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'item_images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated update for item_images' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated update for item_images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'item_images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated delete for item_images' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated delete for item_images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'item_images');
  END IF;
END $$;

-- 3. RLS Policies on public.item_images table
ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read item_images' AND tablename = 'item_images' AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Authenticated read item_images"
      ON public.item_images FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated insert item_images' AND tablename = 'item_images' AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Authenticated insert item_images"
      ON public.item_images FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated update item_images' AND tablename = 'item_images' AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Authenticated update item_images"
      ON public.item_images FOR UPDATE
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated delete item_images' AND tablename = 'item_images' AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Authenticated delete item_images"
      ON public.item_images FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 4. Index on item_images (id_item) for fast lookups
CREATE INDEX IF NOT EXISTS idx_item_images_id_item ON public.item_images(id_item);
