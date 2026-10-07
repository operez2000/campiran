-- Migration 009: Add is_cover to public.item_images for product catalog
-- Run in Supabase SQL Editor if needed:
-- https://supabase.com/dashboard/project/qqcvsmtftbxvqbymphru/sql

-- 1. Add is_cover column to public.item_images
ALTER TABLE public.item_images 
ADD COLUMN IF NOT EXISTS is_cover boolean NOT NULL DEFAULT false;

-- 2. Set the first existing image of each item as cover if none is cover
UPDATE public.item_images AS img
SET is_cover = true
WHERE img.id_item_image IN (
  SELECT DISTINCT ON (id_item) id_item_image
  FROM public.item_images
  ORDER BY id_item, created_at ASC
);

-- 3. Create index for fast lookups by item and cover flag
CREATE INDEX IF NOT EXISTS idx_item_images_is_cover ON public.item_images(id_item, is_cover);

-- 4. Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload config';
