-- Migration: Add caller_number to calls table for sticky routing
-- Run this in your Supabase SQL Editor
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS caller_number text;
-- Comment
COMMENT ON COLUMN public.calls.caller_number IS 'For outbound calls, the actual phone number used as Caller ID. Used for sticky routing.';