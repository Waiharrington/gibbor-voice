'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Phone, Clock, MessageSquare, Settings, User, BarChart3, Activity, LogOut, Shield } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

import { usePresence } from '@/hooks/usePresence';

interface SidebarProps {
    currentView?: string;
    onViewChange?: (view: string) => void;
    isOpen?: boolean;
    onClose?: () => void;
    userRole: string;
}

const APP_VERSION = "v1.9.1 (Stable)";

export default function Sidebar({ currentView, onViewChange, isOpen: externalIsOpen, onClose, userRole }: SidebarProps) {
    const router = useRouter();
    const [isAdmin, setIsAdmin] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [internalIsOpen, setInternalIsOpen] = useState(false);

    // Determine if controlled or uncontrolled
    const isControlled = typeof externalIsOpen !== 'undefined';
    const showSidebar = isControlled ? externalIsOpen : internalIsOpen;

    const handleToggle = () => {
        if (isControlled) {
            if (onClose) onClose();
        } else {
            setInternalIsOpen(!internalIsOpen);
        }
    };

    const handleClose = () => {
        if (isControlled) {
            if (onClose) onClose();
        } else {
            setInternalIsOpen(false);
        }
    };

    // Broadcast Presence
    usePresence(user);

    const checkUserRole = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUser(user);
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

    useEffect(() => {
        checkUserRole();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleNav = (view: string, e: React.MouseEvent) => {
        if (onViewChange) {
            e.preventDefault();
            onViewChange(view);
            // Close on nav click if mobile
            if (window.innerWidth < 1536) {
                handleClose();
            }
        } else {
            // If no view handler (e.g. we are in Admin page), navigate to dashboard
            router.push('/');
        }
    };

    return (
        <>
            {/* Mobile Toggle */}
            {!isControlled && (
                <div className="2xl:hidden fixed top-0 left-0 p-4 z-50">
                    <button
                        onClick={handleToggle}
                        className="p-2 bg-white rounded-lg shadow-md border border-gray-200 text-gray-700 mt-2"
                        aria-label="Toggle Sidebar"
                        title="Toggle Sidebar"
                    >
                        <div className="space-y-1">
                            <span className={`block w-6 h-0.5 bg-gray-600 transition-transform ${showSidebar ? 'rotate-45 translate-y-1.5' : ''}`}></span>
                            <span className={`block w-6 h-0.5 bg-gray-600 transition-opacity ${showSidebar ? 'opacity-0' : ''}`}></span>
                            <span className={`block w-6 h-0.5 bg-gray-600 transition-transform ${showSidebar ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
                        </div>
                    </button>
                </div>
            )}

            {/* Overlay */}
            {showSidebar && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 2xl:hidden"
                    onClick={handleClose}
                />
            )}

            <aside className={`fixed inset-y-0 left-0 z-[60] w-64 bg-gray-50 border-r border-gray-200 h-screen flex flex-col transform transition-transform duration-200 ease-in-out 2xl:translate-x-0 2xl:static ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 flex items-center space-x-2 border-b border-gray-100">
                    <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold">
                        G
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xl font-semibold text-gray-700">Gibbor Voice</span>
                        <span className="text-xs text-gray-400 font-mono">v1.6 (Stable)</span>
                    </div>
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
            </aside>
        </>
    );
}
