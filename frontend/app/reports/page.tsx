'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Calendar, Clock, Phone, Timer } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function ReportsPage() {
    const [stats, setStats] = useState<any>(null);
    const [dateRange, setDateRange] = useState('today');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchReports();
    }, [dateRange, customStart, customEnd]);

    const fetchReports = async () => {
        setIsLoading(true);
        try {
            let start = new Date();
            let end = new Date();

            // Set time to beginning and end of day
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);

            if (dateRange === 'yesterday') {
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
            } else if (dateRange === 'last7') {
                start.setDate(start.getDate() - 7);
            } else if (dateRange === 'custom') {
                if (!customStart || !customEnd) {
                    setIsLoading(false);
                    return;
                }
                start = new Date(customStart);
                end = new Date(customEnd);
                end.setHours(23, 59, 59, 999);
            }

            const queryObj = new URLSearchParams({
                startDate: start.toISOString(),
                endDate: end.toISOString()
            });

            const res = await fetch(`https://gibbor-voice-production.up.railway.app/reports?${queryObj.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (seconds: number) => {
        if (!seconds) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex h-screen bg-gray-50 font-sans">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm z-10">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                        <BarChart3 className="w-6 h-6 mr-3 text-indigo-600" />
                        Reports & Analytics
                    </h1>

                    {/* Date Filters */}
                    <div className="flex items-center space-x-2 bg-gray-100 p-1 rounded-lg">
                        {['today', 'yesterday', 'last7', 'custom'].map(range => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${dateRange === range ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {range === 'today' ? 'Today' : range === 'yesterday' ? 'Yesterday' : range === 'last7' ? 'Last 7 Days' : 'Custom'}
                            </button>
                        ))}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    {dateRange === 'custom' && (
                        <div className="mb-6 flex gap-4 items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border p-2 rounded-lg" />
                            <span className="text-gray-400">to</span>
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border p-2 rounded-lg" />
                        </div>
                    )}

                    {/* KPI CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {/* Card 1: Total Calls */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center">
                            <div className="p-4 bg-blue-50 text-blue-600 rounded-full mr-5">
                                <Phone className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Calls</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{stats?.total_calls || 0}</h3>
                            </div>
                        </div>

                        {/* Card 2: Total Duration */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center">
                            <div className="p-4 bg-purple-50 text-purple-600 rounded-full mr-5">
                                <Clock className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Duration</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{formatTime(stats?.total_duration)}</h3>
                            </div>
                        </div>

                        {/* Card 3: Talk Time */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center">
                            <div className="p-4 bg-green-50 text-green-600 rounded-full mr-5">
                                <Timer className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Talk Time (Connected)</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{formatTime(stats?.connected_duration)}</h3>
                            </div>
                        </div>

                        {/* Card 4: Avg Duration */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center">
                            <div className="p-4 bg-orange-50 text-orange-600 rounded-full mr-5">
                                <BarChart3 className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Avg. Duration</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{formatTime(stats?.avg_duration)}</h3>
                            </div>
                        </div>
                    </div>

                    {/* STATUS CHART (Simple List for now, can upgrade to Recharts later) */}
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                            Outcome Breakdown
                        </h2>

                        {!stats?.status_counts || Object.keys(stats.status_counts).length === 0 ? (
                            <div className="text-center py-10 text-gray-400">No data available for this period</div>
                        ) : (
                            <div className="space-y-4">
                                {Object.entries(stats.status_counts).sort(([, a], [, b]) => (b as number) - (a as number)).map(([status, count]) => {
                                    // Calculate percentage
                                    const total = Object.values(stats.status_counts).reduce((a: any, b: any) => a + b, 0) as number;
                                    const percent = Math.round(((count as number) / total) * 100);

                                    return (
                                        <div key={status} className="relative">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-bold text-gray-700 capitalize">{status}</span>
                                                <span className="text-sm text-gray-500 font-medium">{count as number} ({percent}%)</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                                <div
                                                    className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                                                    style={{ width: `${percent}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </main>
            </div>
        </div>
    );
}
