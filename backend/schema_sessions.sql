-- Si la tabla se creó a medias, bórrala primero
DROP TABLE IF EXISTS public.agent_sessions;

-- Tabla corregida (vínculo con 'profiles')
CREATE TABLE public.agent_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar seguridad
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso
CREATE POLICY "Agents can start session" ON public.agent_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Agents can update own session" ON public.agent_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sessions" ON public.agent_sessions
    FOR SELECT USING (true);
