-- 1. Drop Unused Tables
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.lead_actions CASCADE;
-- (agent_sessions was already dropped, but good safety check)
DROP TABLE IF EXISTS public.agent_sessions CASCADE;
-- 2. Add Quality Metrics to Calls Table
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS quality_score NUMERIC(3, 2),
    -- MOS Score (1.00 - 5.00)
ADD COLUMN IF NOT EXISTS network_warning BOOLEAN DEFAULT FALSE;
-- 3. Optional: Create index for quality reporting
CREATE INDEX IF NOT EXISTS idx_calls_quality ON public.calls(quality_score);