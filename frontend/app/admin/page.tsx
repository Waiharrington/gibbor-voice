'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { Shield, Users, Phone, BarChart3, Plus, ArrowUpRight, Clock } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

export default function AdminPage() {
    const router = useRouter();
    const [stats, setStats] = useState({
        totalCalls: 0,
        totalSales: 0,
        activeAgents: 0
    });
    const [loading, setLoading] = useState(true);

    // Protect Route
    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            const { data } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (data?.role !== 'admin') {
                router.push('/'); // Kick non-admins back to agent dashboard
            } else {
                fetchStats();
            }
        };
        checkAdmin();
    }, []);

    const fetchStats = async () => {
        try {
            const res = await fetch('https://gibbor-voice-production.up.railway.app/reports');
            if (res.ok) {
                const data = await res.json();
                setStats({
                    totalCalls: data.total_calls || 0,
                    // Assuming 'status_counts' has keys like 'Sale', 'Completed' etc. 
                    // Adjust based on your actual disposition values in DB (e.g., 'Venta', 'Cita')
                    totalSales: (data.status_counts['Sale'] || 0) + (data.status_counts['Venta'] || 0) + (data.status_counts['Cita'] || 0),
                    activeAgents: 3 // Still mock for now as we don't have online status yet
                });
            }
        } catch (error) {
            console.error("Error fetching admin stats:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-indigo-600">Loading Admin Panel...</div>;

    return (
        <div className="flex h-screen bg-gray-50 font-sans">
            <Sidebar currentView="admin" />

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm z-10">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                        <Shield className="w-6 h-6 mr-3 text-indigo-600" />
                        Admin Dashboard
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500">Welcome, Admin</span>
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                            A
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Total Calls (Today)</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{stats.totalCalls}</h3>
                                </div>
                                <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                                    <Phone className="w-6 h-6" />
                                </div>
                            </div>
                            <div className="flex items-center text-sm text-green-600">
                                <ArrowUpRight className="w-4 h-4 mr-1" />
                                <span className="font-medium">+12%</span>
                                <span className="text-gray-400 ml-2">from yesterday</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Total Sales/Leads</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{stats.totalSales}</h3>
                                </div>
                                <div className="p-3 bg-green-50 rounded-lg text-green-600">
                                    <BarChart3 className="w-6 h-6" />
                                </div>
                            </div>
                            <div className="flex items-center text-sm text-green-600">
                                <ArrowUpRight className="w-4 h-4 mr-1" />
                                <span className="font-medium">+5%</span>
                                <span className="text-gray-400 ml-2">conversion rate</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Active Agents</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{stats.activeAgents}</h3>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                                    <Users className="w-6 h-6" />
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 mt-2">3 Online • 2 Offline</p>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Campaign Management Shortcut */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Campaign Management</h3>
                            <div className="space-y-4">
                                <button
                                    onClick={() => router.push('/campaigns')}
                                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 rounded-lg transition-colors group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-indigo-100 p-2 rounded-full text-indigo-600 group-hover:bg-indigo-200">
                                            <Plus className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900">Create New Campaign</p>
                                            <p className="text-sm text-gray-500">Upload CSV and assign agents</p>
                                        </div>
                                    </div>
                                    <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600" />
                                </button>

                                <button className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 rounded-lg transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-green-100 p-2 rounded-full text-green-600 group-hover:bg-green-200">
                                            <BarChart3 className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900">View Detailed Reports</p>
                                            <p className="text-sm text-gray-500">Analyze performance metrics</p>
                                        </div>
                                    </div>
                                    <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600" />
                                </button>
                            </div>
                        </div>

                        {/* Recent Activity Feed */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Live Activity</h3>
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-start gap-4 pb-4 border-b border-gray-50 last:border-0">
                                        <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                                        <div>
                                            <p className="text-sm text-gray-800">
                                                <span className="font-bold">Agent Sarah</span> closed a sale with <span className="font-medium">Lead #9283</span>
                                            </p>
                                            <p className="text-xs text-gray-400">2 minutes ago</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </main>
            </div>
        </div>
    );
}
