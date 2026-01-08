'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { User, Clock, Phone, BarChart2, Calendar } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

export default function AgentReportsPage() {
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchReport = async (range: 'today' | 'yesterday' | 'week' | 'all' = 'today') => {
        try {
            setLoading(true);

            const now = new Date();
            let startDate = '', endDate = '';

            // Venezuela is UTC-4. 
            // Ideally, we handle this by calculating offsets, but simplistically:
            // We get the date string in the browser context (User's PC is likely formatted correctly for them)
            // Or we specifically shift time.

            if (range === 'today') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                startDate = today.toISOString();
                endDate = new Date().toISOString();
            } else if (range === 'yesterday') {
                const yest = new Date();
                yest.setDate(yest.getDate() - 1);
                yest.setHours(0, 0, 0, 0);

                const yestEnd = new Date();
                yestEnd.setDate(yestEnd.getDate() - 1);
                yestEnd.setHours(23, 59, 59, 999);

                startDate = yest.toISOString();
                endDate = yestEnd.toISOString();
            } else if (range === 'week') {
                const week = new Date();
                week.setDate(week.getDate() - 7);
                startDate = week.toISOString();
                endDate = new Date().toISOString();
            }

            const query = new URLSearchParams({ startDate, endDate }).toString();
            const res = await fetch(`https://gibbor-voice-production.up.railway.app/reports/agents?${query}`);

            if (res.ok) {
                const data = await res.json();
                setReportData(data);
            }
        } catch (error) {
            console.error("Error fetching agent report:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, []);

    // Format seconds to HH:MM:SS
    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex h-screen bg-gray-50">
            <Sidebar userRole="admin" />
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Agent Performance</h1>
                        <p className="text-gray-500">Track hours, calls, and outcomes per agent.</p>
                    </div>
                    <div className="flex gap-2">
                        <select
                            onChange={(e) => fetchReport(e.target.value as any)}
                            className="bg-white border rounded-lg px-3 py-2 text-sm text-gray-700"
                        >
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="week">Last 7 Days</option>
                            <option value="all">All Time</option>
                        </select>
                        <button
                            onClick={() => fetchReport('today')}
                            className="bg-white border rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                            <Calendar className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-20 text-gray-500">Loading Report...</div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                    <th className="p-4 font-semibold">Agent</th>
                                    <th className="p-4 font-semibold">Online Time</th>
                                    <th className="p-4 font-semibold">Talk Time</th>
                                    <th className="p-4 font-semibold">Total Calls</th>
                                    <th className="p-4 font-semibold">Top Outcome</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {reportData.map((agent, i) => {
                                    // Find top disposition
                                    let topDispo = '-';
                                    let maxCount = 0;
                                    Object.entries(agent.dispositions || {}).forEach(([k, v]: any) => {
                                        if (v > maxCount) {
                                            maxCount = v;
                                            topDispo = `${k} (${v})`;
                                        }
                                    });

                                    return (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                                        <User className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">{agent.agent_name}</div>
                                                        <div className="text-xs text-gray-500">{agent.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-gray-700">
                                                    <Clock className="w-4 h-4 text-emerald-500" />
                                                    {formatDuration(agent.total_online_seconds)}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-gray-700">
                                                    <Phone className="w-4 h-4 text-blue-500" />
                                                    {formatDuration(agent.total_talk_seconds)}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                    {agent.total_calls} calls
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm text-gray-600">
                                                {topDispo !== '-' ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                                        {topDispo}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400">No data</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
