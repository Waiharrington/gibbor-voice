'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Clock, PhoneIncoming, PhoneOutgoing, User } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

const API_BASE_URL = 'https://gibbor-voice-production.up.railway.app';

export default function History() {
    const [calls, setCalls] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [userRole, setUserRole] = useState<string | null>(null);

    console.log("HISTORY PAGE VERSION: 1.1 (Recordings)"); // DEBUG LOG

    // 1. Fetch User & Role
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                // Allow Super Admins even if role logic fails
                if (user.email === 'info@gibborcenter.com' || user.email === 'admin@gibborcenter.com') {
                    setUserRole('admin');
                } else {
                    setUserRole(profile?.role || 'agent');
                }
            }
        };
        getUser();
    }, []);

    // 2. Fetch History once User is known
    useEffect(() => {
        const fetchHistory = async () => {
            if (!user) return;

            try {
                const response = await fetch(`${API_BASE_URL}/history/calls?userId=${user.id}&role=${userRole || 'agent'}`);
                const data = await response.json();
                setCalls(data);
            } catch (error) {
                console.error('Error fetching call history:', error);
            }
        };

        if (user) {
            fetchHistory();
        }
    }, [user, userRole]);



    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <div className="flex h-screen bg-white">
            <Sidebar />
            <main className="flex-1 flex flex-col bg-gray-50">
                <header className="h-16 border-b border-gray-200 flex items-center px-8 bg-white">
                    <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                        <Clock className="w-5 h-5 mr-3 text-gray-600" />
                        Call History
                    </h1>
                </header>

                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full max-w-[95%] mx-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {userRole === 'admin' && (
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                                    )}
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recording</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {calls.map((call) => (
                                    <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                                        {userRole === 'admin' && (
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                                                <div className="flex items-center">
                                                    <User className="w-4 h-4 mr-2 text-gray-400" />
                                                    {call.agent_name || '—'}
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {call.direction === 'inbound' ? (
                                                <div className="flex items-center text-blue-600">
                                                    <PhoneIncoming className="w-4 h-4 mr-2" />
                                                    <span className="text-sm">Inbound</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-green-600">
                                                    <PhoneOutgoing className="w-4 h-4 mr-2" />
                                                    <span className="text-sm">Outbound</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{call.from}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{call.to}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {call.recording_url ? (
                                                <audio controls src={call.recording_url} className="h-8 w-48" preload="metadata">
                                                    Your browser does not support the audio element.
                                                </audio>
                                            ) : (
                                                <span className="text-gray-400 text-xs italic">No audio</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(call.created_at)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${call.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                call.status === 'busy' || call.status === 'failed' ? 'bg-red-100 text-red-800' :
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {call.status || 'unknown'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {calls.length === 0 && (
                                    <tr>
                                        <tr>
                                            <td colSpan={userRole === 'admin' ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                                                No calls found in history.
                                            </td>
                                        </tr>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
