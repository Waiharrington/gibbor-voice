import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

export interface AgentPresence {
    user_id: string;
    email: string;
    status: 'online' | 'in-call' | 'idle';
    online_at: string;
}

export function usePresence(user: any, initialStatus: 'online' | 'in-call' | 'idle' = 'online') {
    const [onlineUsers, setOnlineUsers] = useState<AgentPresence[]>([]);
    const [channel, setChannel] = useState<any>(null);

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
                const agents: AgentPresence[] = [];
                Object.values(newState).forEach((presences: any) => {
                    presences.forEach((p: any) => {
                        agents.push(p);
                    });
                });
                setOnlineUsers(agents);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('join', key, newPresences);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('leave', key, leftPresences);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await room.track({
                        user_id: user.id,
                        email: user.email,
                        status: initialStatus,
                        online_at: new Date().toISOString(),
                    });
                }
            });

        setChannel(room);

        return () => {
            supabase.removeChannel(room);
        };
    }, [user?.id]); // Only re-run if user changes

    const updateStatus = async (status: 'online' | 'in-call' | 'idle') => {
        if (channel) {
            await channel.track({
                user_id: user.id,
                email: user.email,
                status: status,
                online_at: new Date().toISOString(),
            });
        }
    };

    return { onlineUsers, updateStatus };
}
