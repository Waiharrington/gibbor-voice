'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Phone, Users, Play, Square, Activity, Volume2, Voicemail } from 'lucide-react';

interface Line {
    id: number;
    status: string;
    lead: { name: string; phone: string; } | null;
}

export default function AutoDialerPage() {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
    const [selectedCallerId, setSelectedCallerId] = useState('');
    const [isDialing, setIsDialing] = useState(false);

    // Mock State for Lines (will be real later)
    const [lines, setLines] = useState<Line[]>([
        { id: 1, status: 'Idle', lead: null },
        { id: 2, status: 'Idle', lead: null },
        { id: 3, status: 'Idle', lead: null },
    ]);

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const res = await fetch('https://gibbor-voice-production.up.railway.app/campaigns');
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const fetchNumbers = async () => {
        try {
            const res = await fetch('https://gibbor-voice-production.up.railway.app/incoming-phone-numbers');
            if (res.ok) {
                const data = await res.json();
                setAvailableNumbers(data);
                if (data.length > 0) setSelectedCallerId(data[0].phoneNumber);
            }
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchNumbers();
    }, []);

    const toggleDialer = () => {
        if (!selectedCampaignId && !isDialing) {
            alert("Please select a campaign first.");
            return;
        }
        if (!selectedCallerId && !isDialing) {
            alert("Please select a Caller ID.");
            return;
        }
        setIsDialing(!isDialing);

        // Mocking the "Start" effect for visual feedback
        if (!isDialing) {
            setLines([
                { id: 1, status: 'Dialing...', lead: { name: 'Juan Perez', phone: '+1234567890' } },
                { id: 2, status: 'Ringing...', lead: { name: 'Maria Lopez', phone: '+1987654321' } },
                { id: 3, status: 'Idle', lead: null },
            ]);
        } else {
            setLines([
                { id: 1, status: 'Idle', lead: null },
                { id: 2, status: 'Idle', lead: null },
                { id: 3, status: 'Idle', lead: null },
            ]);
        }
    };

    return (
        <div className="flex h-screen bg-gray-50 font-sans">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm z-10">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                        <Activity className="w-6 h-6 mr-3 text-red-600" />
                        Auto Dialer (Multi-Line)
                    </h1>
                </header>

                <main className="flex-1 overflow-y-auto p-8">

                    {/* Controls */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8 flex items-center gap-6">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Campaign</label>
                            <select
                                className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5"
                                value={selectedCampaignId}
                                onChange={(e) => setSelectedCampaignId(e.target.value)}
                                disabled={isDialing}
                            >
                                <option value="">-- Select --</option>
                                {campaigns.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Make Calls From (Caller ID)</label>
                            <select
                                className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5"
                                value={selectedCallerId}
                                onChange={(e) => setSelectedCallerId(e.target.value)}
                                disabled={isDialing}
                            >
                                <option value="">-- Select --</option>
                                {availableNumbers.map(n => (
                                    <option key={n.phoneNumber} value={n.phoneNumber}>
                                        {n.friendlyName || n.phoneNumber}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-end">
                            <button
                                onClick={toggleDialer}
                                className={`flex items-center gap-2 px-8 py-3 rounded-lg font-bold text-white transition-all shadow-md ${isDialing
                                    ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                                    : 'bg-green-600 hover:bg-green-700 shadow-green-200'
                                    }`}
                            >
                                {isDialing ? (
                                    <>
                                        <Square className="w-5 h-5 fill-current" /> STOP DIALING
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-5 h-5 fill-current" /> START AUTO DIALER
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Live Monitor (The 3 Lines) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {lines.map((line) => (
                            <div key={line.id} className={`relative overflow-hidden rounded-2xl border-2 transition-all duration-300 ${line.status === 'Connected' ? 'border-green-500 bg-green-50' :
                                line.status === 'Ringing...' ? 'border-yellow-400 bg-yellow-50' :
                                    line.status === 'Dialing...' ? 'border-blue-300 bg-blue-50' :
                                        'border-gray-200 bg-white'
                                } h-64 flex flex-col items-center justify-center p-6 shadow-sm`}>

                                {/* Status badge */}
                                <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${line.status === 'Connected' ? 'bg-green-200 text-green-800' :
                                    line.status === 'Ringing...' ? 'bg-yellow-200 text-yellow-800' :
                                        line.status === 'Dialing...' ? 'bg-blue-200 text-blue-800' :
                                            'bg-gray-100 text-gray-500'
                                    }`}>
                                    {line.status}
                                </div>

                                {/* Line Icon */}
                                <div className={`mb-4 p-4 rounded-full ${line.status === 'Idle' ? 'bg-gray-100 text-gray-400' : 'bg-white shadow-md text-indigo-600'
                                    }`}>
                                    <Phone className={`w-8 h-8 ${line.status === 'Ringing...' ? 'animate-pulse' : ''}`} />
                                </div>

                                {/* Lead Info */}
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-gray-800 mb-1">
                                        {line.lead ? (line.lead as any).name : `Line ${line.id}`}
                                    </h3>
                                    <p className="text-gray-500 font-mono text-sm">
                                        {line.lead ? (line.lead as any).phone : 'Waiting...'}
                                    </p>
                                </div>

                                {/* AMD Indicator (Visual Flair) */}
                                {['Dialing...', 'Ringing...'].includes(line.status) && (
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-2 text-xs text-gray-400">
                                        <Volume2 className="w-3 h-3 animate-ping" />
                                        <span>Detecting Human vs Machine...</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Stats / Explainer */}
                    <div className="mt-12 bg-indigo-900 rounded-2xl p-8 text-white relative overflow-hidden">
                        <div className="relative z-10 max-w-2xl">
                            <h2 className="text-2xl font-bold mb-4">How Multi-Line Works</h2>
                            <ul className="space-y-3 text-indigo-100">
                                <li className="flex items-center gap-3">
                                    <span className="bg-white/20 p-1 rounded">1</span>
                                    We dial 3 numbers simultaneously.
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="bg-white/20 p-1 rounded">2</span>
                                    Our AI listens for audio (Hello?) vs Silence/Beeps.
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="bg-white/20 p-1 rounded">3</span>
                                    <span className="font-bold text-white">Only ANY HUMAN</span> is connected to you instantly.
                                </li>
                            </ul>
                        </div>
                        <Voicemail className="absolute -bottom-10 -right-10 w-64 h-64 text-white/5 rotate-12" />
                    </div>

                </main>
            </div>
        </div>
    );
}
