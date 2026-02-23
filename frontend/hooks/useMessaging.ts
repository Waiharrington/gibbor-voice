
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';

export interface UseMessagingProps {
    userId: string | null;
    userRole: string | null;
    apiBaseUrl: string;
}

export function useMessaging({ userId, userRole, apiBaseUrl }: UseMessagingProps) {
    const [messages, setMessages] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const normalizePhoneNumber = useCallback((phone: string) => {
        if (!phone) return '';
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) return `+1${digits}`;
        if (digits.length > 10) return `+${digits}`;
        return phone;
    }, []);

    const getConversationId = useCallback((msg: any) => {
        const rawId = msg.direction === 'outbound' ? msg.to : msg.from;
        return normalizePhoneNumber(rawId);
    }, [normalizePhoneNumber]);

    const fetchMessages = useCallback(async () => {
        if (!userId) return;
        try {
            setIsLoading(true);
            let url = `${apiBaseUrl}/history/messages`;
            const params = new URLSearchParams();
            params.append('userId', userId);
            if (userRole) params.append('role', userRole);

            const response = await fetch(`${url}?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch messages');
            const data = await response.json();
            setMessages(Array.isArray(data) ? data : []);
        } catch (err: any) {
            console.error('Error fetching messages:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [userId, userRole, apiBaseUrl]);

    useEffect(() => {
        fetchMessages();

        const channel = supabase
            .channel('messages_realtime_hook')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                setMessages((prev) => [...prev, payload.new]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchMessages]);

    const conversations = useMemo(() => {
        const groups: { [key: string]: any[] } = {};

        messages.forEach(msg => {
            const id = getConversationId(msg);
            if (!groups[id]) groups[id] = [];
            groups[id].push(msg);
        });

        return Object.entries(groups).map(([id, msgs]) => {
            const lastMsg = msgs[msgs.length - 1];
            return {
                id,
                messages: msgs,
                lastMessage: lastMsg,
                timestamp: new Date(lastMsg.created_at).getTime()
            };
        }).sort((a, b) => b.timestamp - a.timestamp);
    }, [messages, getConversationId]);

    return {
        messages,
        conversations,
        isLoading,
        error,
        refreshMessages: fetchMessages,
        normalizePhoneNumber
    };
}
