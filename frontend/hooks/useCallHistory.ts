
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';

export interface UseCallHistoryProps {
    userId: string | null;
    userRole: string | null;
    apiBaseUrl: string;
}

export function useCallHistory({ userId, userRole, apiBaseUrl }: UseCallHistoryProps) {
    const [calls, setCalls] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchHistory = useCallback(async () => {
        if (!userId) return;
        try {
            setIsLoading(true);
            let historyUrl = `${apiBaseUrl}/history/calls?userId=${userId}`;
            if (userRole) historyUrl += `&role=${userRole}`;

            const res = await fetch(historyUrl);
            if (!res.ok) throw new Error('Failed to fetch history');
            const data = await res.json();
            setCalls(Array.isArray(data) ? data : []);
        } catch (err: any) {
            console.error('Error fetching history:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [userId, userRole, apiBaseUrl]);

    useEffect(() => {
        fetchHistory();

        const channel = supabase
            .channel('calls_realtime_hook')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (payload) => {
                setCalls((prev) => [payload.new, ...prev]);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, (payload) => {
                setCalls((prev) => prev.map(call => call.id === payload.new.id ? payload.new : call));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchHistory]);

    return {
        calls,
        isLoading,
        error,
        refreshHistory: fetchHistory
    };
}
