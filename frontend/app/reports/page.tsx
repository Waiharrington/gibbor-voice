'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Calendar, Clock, Phone, Timer, Users } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

// Constants
const API_BASE_URL = 'https://gibbor-voice-production.up.railway.app';

export default function ReportsPage() {

    const [reportsData, setReportsData] = useState<any[]>([]); // Array of agent reports
    const [aggregatedStats, setAggregatedStats] = useState<any>(null); // Aggregated single object
    const [dateRange, setDateRange] = useState('today');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedCampaignId, setSelectedCampaignId] = useState('all');
    const [selectedAgentId, setSelectedAgentId] = useState('all'); // NEW: Agent Filter
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Derived list of unique agents from the reports data
    const agents = useMemo(() => {
        if (!reportsData || reportsData.length === 0) return [];
        return reportsData.map(r => ({
            email: r.email,
            name: r.agent_name || r.email
        }));
    }, [reportsData]);

    useEffect(() => {
        fetchCampaigns();
    }, []);

    useEffect(() => {
        fetchReports();
    }, [dateRange, customStart, customEnd, selectedCampaignId]);

    // Re-calculate stats whenever filtered data or selection changes
    useEffect(() => {
        if (!reportsData) return;
        calculateStats();
    }, [reportsData, selectedAgentId]);


    const fetchCampaigns = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/campaigns`);
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data);
            }
        } catch (error) {
            console.error(error);
        }
    };

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
                endDate: end.toISOString(),
                campaignId: selectedCampaignId
            });

            console.log("Fetching reports with params:", queryObj.toString());

            // Correct Endpoint: /reports/agents returns the array of agent stats
            const res = await fetch(`${API_BASE_URL}/reports/agents?${queryObj.toString()}`);
            if (res.ok) {
                const data = await res.json(); // Takes ARRAY of reports
                console.log("Reports Data Received:", data);
                if (Array.isArray(data)) {
                    setReportsData(data);
                } else {
                    console.warn("Expected array but got:", data);
                    setReportsData([]); // Safety fallback
                }
            } else {
                console.error("Failed to fetch reports");
                setReportsData([]);
            }
        } catch (error) {
            console.error(error);
            setReportsData([]);
        } finally {
            setIsLoading(false);
        }
    };

    const calculateStats = () => {
        if (!reportsData || reportsData.length === 0) {
            setAggregatedStats(null);
            return;
        }

        let filteredData = reportsData;

        // Filter by Agent if selected
        if (selectedAgentId !== 'all') {
            filteredData = reportsData.filter(r => r.email === selectedAgentId);
        }

        // Aggregate Data
        const initialStats = {
            total_calls: 0,
            total_duration: 0, // Online Time
            talk_time: 0,
            status_counts: {} as Record<string, number>
        };

        const result = filteredData.reduce((acc, curr) => {
            acc.total_calls += (curr.total_calls || 0);
            acc.total_duration += (curr.total_online_seconds || 0);
            acc.talk_time += (curr.total_talk_seconds || 0);

            // Merge status counts
            if (curr.dispositions) {
                Object.entries(curr.dispositions).forEach(([status, count]) => {
                    acc.status_counts[status] = (acc.status_counts[status] || 0) + (count as number);
                });
            }
            return acc;
        }, initialStats);

        // Calculate Avg Duration (Talk Time / Calls)
        const avg_duration = result.total_calls > 0 ? result.talk_time / result.total_calls : 0;

        setAggregatedStats({
            ...result,
            avg_duration
        });
    };


    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
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

                    <div className="flex items-center space-x-4">

                        {/* Agent Filter */}
                        <div className="relative">
                            <select
                                className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-1.5 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-indigo-500 text-sm font-medium"
                                value={selectedAgentId}
                                onChange={(e) => setSelectedAgentId(e.target.value)}
                            >
                                <option value="all">All Agents</option>
                                {agents.map((agent: any) => (
                                    <option key={agent.email} value={agent.email}>{agent.name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                <Users className="h-4 w-4 text-gray-500" />
                            </div>
                        </div>

                        {/* Campaign Filter */}
                        <div className="relative">
                            <select
                                className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-1.5 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-indigo-500 text-sm font-medium"
                                value={selectedCampaignId}
                                onChange={(e) => setSelectedCampaignId(e.target.value)}
                            >
                                <option value="all">All Campaigns</option>
                                {campaigns.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                            </div>
                        </div>


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
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center transition-all hover:shadow-md">
                            <div className="p-4 bg-blue-50 text-blue-600 rounded-full mr-5">
                                <Phone className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Calls</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{aggregatedStats?.total_calls || 0}</h3>
                            </div>
                        </div>

                        {/* Card 2: Agent Online Time */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center transition-all hover:shadow-md">
                            <div className="p-4 bg-purple-50 text-purple-600 rounded-full mr-5">
                                <Clock className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Agent Online Time</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{formatTime(aggregatedStats?.total_duration)}</h3>
                            </div>
                        </div>

                        {/* Card 3: Talk Time */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center transition-all hover:shadow-md">
                            <div className="p-4 bg-green-50 text-green-600 rounded-full mr-5">
                                <Timer className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Talk Time (Connected)</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{formatTime(aggregatedStats?.talk_time)}</h3>
                            </div>
                        </div>

                        {/* Card 4: Avg Duration */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center transition-all hover:shadow-md">
                            <div className="p-4 bg-orange-50 text-orange-600 rounded-full mr-5">
                                <BarChart3 className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Avg. Duration</p>
                                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{formatTime(aggregatedStats?.avg_duration)}</h3>
                            </div>
                        </div>
                    </div>

                    {/* STATUS CHART */}
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                            Outcome Breakdown
                        </h2>

                        {!aggregatedStats?.status_counts || Object.keys(aggregatedStats.status_counts).length === 0 ? (
                            <div className="text-center py-12 text-gray-400 flex flex-col items-center">
                                <div className="bg-gray-100 p-4 rounded-full mb-3">
                                    <BarChart3 className="w-8 h-8 text-gray-400" />
                                </div>
                                <p>No data available for this period</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {Object.entries(aggregatedStats.status_counts).sort(([, a], [, b]) => (b as number) - (a as number)).map(([status, count]) => {
                                    // Calculate percentage
                                    const total = Object.values(aggregatedStats.status_counts).reduce((a: any, b: any) => a + b, 0) as number;
                                    const percent = Math.round(((count as number) / total) * 100);

                                    return (
                                        <div key={status} className="relative">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-bold text-gray-700 capitalize flex items-center">
                                                    <span className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></span>
                                                    {status}
                                                </span>
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
