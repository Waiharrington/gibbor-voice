-- Add user_id column to calls table to link calls to specific agents
ALTER TABLE public.calls 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Optional: Index for performance
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON public.calls(user_id);

-- Update RLS policy to allow users to see only their own calls (if we were strictly using RLS)
-- For now, backend handles filtering, but good to have constraint.
-- (This assumes we might switch to strict RLS later, but for now just adding the column is enough for the nodejs backend to use)
