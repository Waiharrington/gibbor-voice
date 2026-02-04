-- Migration: Add Number Assignment columns to profiles
-- Run this in your Supabase SQL Editor
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS assigned_caller_ids text [] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS callback_number text DEFAULT '';
-- Comments for clarity
COMMENT ON COLUMN public.profiles.assigned_caller_ids IS 'List of Twilio phone numbers this agent is allowed to use as Caller ID';
COMMENT ON COLUMN public.profiles.callback_number IS 'The phone number agents should tell customers to call back';