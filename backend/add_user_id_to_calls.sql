-- Add user_id column to calls table for Sticky Agent Routing
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
-- Optional: Index for performance on routing lookups
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON public.calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_to_number ON public.calls("to");
-- Verify
-- SELECT * FROM calls LIMIT 1;