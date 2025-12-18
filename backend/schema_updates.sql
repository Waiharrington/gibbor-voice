-- Add disposition column to calls table
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS disposition TEXT;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS notes TEXT;
