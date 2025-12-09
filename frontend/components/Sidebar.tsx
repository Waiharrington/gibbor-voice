'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Phone, Clock, MessageSquare, Settings, User, BarChart3, Activity, LogOut, Shield } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

interface SidebarProps {
    currentView?: string;
    onViewChange?: (view: string) => void;
}

export default function Sidebar({ currentView, onViewChange }: SidebarProps) {
    const router = useRouter();
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        checkUserRole();
    }, []);

    const checkUserRole = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            // Safety cast to avoid TS strict null checks failing build
            const profile = data as any;
            if (profile?.role === 'admin') setIsAdmin(true);

            // FALLBACK: Hardcode admin email just in case DB role isn't set yet
            if (user.email === 'admin@gibborcenter.com' || user.email === 'info@gibborcenter.com') setIsAdmin(true);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleNav = (view: string, e: React.MouseEvent) => {
        if (onViewChange) {
            e.preventDefault();
            onViewChange(view);
        }
    };

    return (
        <aside className="w-64 bg-gray-50 border-r border-gray-200 h-screen flex flex-col">
            <div className="p-4 flex items-center space-x-2 border-b border-gray-100">
                <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold">
                    G
                </div>
                <span className="text-xl font-semibold text-gray-700">Gibbor Voice</span>
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
                <ul className="space-y-1">
                    <li>
                        <button
                            onClick={(e) => handleNav('calls', e)}
                            className={`w-full flex items-center px-4 py-3 cursor-pointer transition-colors ${currentView === 'calls' ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <Phone className="w-5 h-5 mr-3 text-gray-500" />
                            Calls
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={(e) => handleNav('messages', e)}
                            className={`w-full flex items-center px-4 py-3 cursor-pointer transition-colors ${currentView === 'messages' ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <MessageSquare className="w-5 h-5 mr-3 text-gray-500" />
                            Messages
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={(e) => handleNav('campaigns', e)}
                            className={`w-full flex items-center px-4 py-3 cursor-pointer transition-colors ${currentView === 'campaigns' ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <BarChart3 className="w-5 h-5 mr-3 text-gray-500" />
                            Campaigns
                        </button>
                    </li>
                    <li>
                        {/* Auto Dialer Link */}
                        <Link href="/auto-dialer" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 transition-colors">
                            <Activity className="w-5 h-5 mr-3 text-gray-500" />
                            Auto Dialer
                        </Link>
                    </li>
                    <li>
                        <Link href="/history" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 transition-colors">
                            <Clock className="w-5 h-5 mr-3 text-gray-500" />
                            History
                        </Link>
                    </li>
                    <li>
                        <Link href="/reports" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 transition-colors">
                            <BarChart3 className="w-5 h-5 mr-3 text-gray-500" />
                            Reports
                        </Link>
                    </li>
                    <li>
                        <Link href="/contacts" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 transition-colors">
                            <User className="w-5 h-5 mr-3 text-gray-500" />
                            Contacts
                        </Link>
                    </li>
                </ul>
            </nav>

            <div className="p-4 border-t border-gray-200 space-y-2">
                {isAdmin && (
                    <Link href="/admin" className="flex items-center px-4 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors font-medium">
                        <Shield className="w-5 h-5 mr-3" />
                        Admin Panel
                    </Link>
                )}
                <Link href="/settings" className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                    <Settings className="w-5 h-5 mr-3 text-gray-500" />
                    Settings
                </Link>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                    <LogOut className="w-5 h-5 mr-3" />
                    Logout
                </button>
            </div>
        </aside >
    );
}
