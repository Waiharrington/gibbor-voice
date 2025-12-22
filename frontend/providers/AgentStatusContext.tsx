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
                online_at: new Date().toISOString(),
            });
        }
    }, [status]);

    // 4. Inactivity Timer (Auto Logout)
    useEffect(() => {
        let timeout: NodeJS.Timeout;

        const resetTimer = () => {
            if (!user) return;
            clearTimeout(timeout);
            // 15 Minutes = 900,000 ms
            timeout = setTimeout(handleInactivity, 15 * 60 * 1000);
        };

        const handleInactivity = async () => {
            console.log("User inactive for 15 mins. Logging out...");
            if (sessionId) await endSession(sessionId);
            await supabase.auth.signOut();
            window.location.href = '/login'; // Force redirect
        };

        // Listen for events
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keydown', resetTimer);
        window.addEventListener('click', resetTimer);

        resetTimer(); // Init

        return () => {
            clearTimeout(timeout);
            window.removeEventListener('mousemove', resetTimer);
            window.removeEventListener('keydown', resetTimer);
            window.removeEventListener('click', resetTimer);
        };
    }, [user, sessionId]);

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
