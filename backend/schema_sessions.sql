-- Create table for tracking agent sessions (work hours)
CREATE TABLE IF NOT EXISTS public.agent_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
-- Agents can INSERT their own session start
CREATE POLICY "Agents can start session" ON public.agent_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Agents can UPDATE their own session (to close it)
CREATE POLICY "Agents can update own session" ON public.agent_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can VIEW all sessions
CREATE POLICY "Admins can view all sessions" ON public.agent_sessions
    FOR SELECT USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
        OR auth.uid() = user_id 
    );
