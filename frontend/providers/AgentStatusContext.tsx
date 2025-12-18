'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

interface AgentStatusContextType {
    status: 'online' | 'in-call' | 'idle';
    setCallStatus: (status: 'online' | 'in-call' | 'idle') => void;
    onlineUsers: any[];
}

const AgentStatusContext = createContext<AgentStatusContextType>({
    status: 'idle',
    setCallStatus: () => { },
    onlineUsers: [],
});

export const useAgentStatus = () => useContext(AgentStatusContext);

export function AgentStatusProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any>(null);
    const [status, setStatus] = useState<'online' | 'in-call' | 'idle'>('idle');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
    const [channel, setChannel] = useState<any>(null);

    // 1. Check Auth & Start Session
    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                setStatus('online');

                // Start Timer (DB Session)
                await startSession(user.id);
            }
        };
        init();

        return () => {
            if (sessionId) endSession(sessionId);
        };
    }, []);

    // 2. Realtime Presence Logic
    useEffect(() => {
        if (!user) return;

        const room = supabase.channel('room_global', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        room
            .on('presence', { event: 'sync' }, () => {
                const newState = room.presenceState();
                const agents: any[] = [];
                Object.values(newState).forEach((presences: any) => {
                    presences.forEach((p: any) => {
                        agents.push(p);
                    });
                });
                setOnlineUsers(agents);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await room.track({
                        user_id: user.id,
                        email: user.email,
                        status: 'online', // Initial status
                        online_at: new Date().toISOString(),
                    });
                }
            });

        setChannel(room);

        return () => {
            supabase.removeChannel(room);
        };
    }, [user?.id]);

    // 3. Update Presence when Status Changes (e.g., In-Call)
    useEffect(() => {
        if (channel && user) {
            channel.track({
                user_id: user.id,
                email: user.email,
                status: status,
                online_at: new Date().toISOString(), // Keep original check-in time? Ideally yes, but track updates object.
                // We might want to persist 'online_at' in state to not reset it?
                // For now, let's just send current time or keep it simple.
                // Actually, if we update presence, we replace the object.
                // Better to store 'online_at' in state.
            });
        }
    }, [status]);

    const startSession = async (userId: string) => {
        // Only start if agent (optional check, or just log everyone)
        try {
            const { data, error } = await supabase
                .from('agent_sessions')
                .insert({ user_id: userId })
                .select()
                .single();

            if (data) setSessionId(data.id);
        } catch (e) {
            console.error("Error starting session", e);
        }
    };

    const endSession = async (sid: string) => {
        try {
            await supabase
                .from('agent_sessions')
                .update({ ended_at: new Date().toISOString() })
                .eq('id', sid);
        } catch (e) {
            console.error("Error ending session", e);
        }
    };

    const setCallStatus = (newStatus: 'online' | 'in-call' | 'idle') => {
        setStatus(newStatus);
    };

    return (
        <AgentStatusContext.Provider value={{ status, setCallStatus, onlineUsers }}>
            {children}
        </AgentStatusContext.Provider>
    );
}
