
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useRouter } from 'next/navigation';

export function useAuth() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) {
                    router.push('/login');
                    return;
                }

                setUser(currentUser);

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', currentUser.id)
                    .single();

                let role = profile?.role || 'agent';

                // Admin overrides
                const email = currentUser.email?.toLowerCase() || '';
                if (email === 'admin@gibborcenter.com' || email === 'info@gibborcenter.com') {
                    role = 'admin';
                }

                setUserRole(role);
            } catch (error) {
                console.error('Auth error:', error);
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, [router]);

    return { user, userRole, isLoading };
}
