'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { Phone, Users, Play, Square, Activity, Volume2, Voicemail, Mic, MicOff, X, PhoneOff } from 'lucide-react';
import { Device } from '@twilio/voice-sdk';
import { supabase } from '@/utils/supabaseClient';

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

    // activeCallState (when bridged)
    const [device, setDevice] = useState<Device | null>(null);
    const [activeConnection, setActiveConnection] = useState<any | null>(null);
    const [connectedLead, setConnectedLead] = useState<any | null>(null);
    const [callStatus, setCallStatus] = useState('Idle');
    const [isMuted, setIsMuted] = useState(false);

    // Mock State for Lines (will be real later)
    const [lines, setLines] = useState<Line[]>([
        { id: 1, status: 'Idle', lead: null },
        { id: 2, status: 'Idle', lead: null },
        { id: 3, status: 'Idle', lead: null },
    ]);



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

    useEffect(() => {
        fetchCampaigns();
    }, []);

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

    const fetchLeadDetails = async (id: string) => {
        const { data } = await supabase.from('leads').select('*').eq('id', id).single();
        if (data) setConnectedLead(data);
    };

    const handleHangup = () => {
        if (activeConnection) {
            activeConnection.disconnect();
        }
    };

    // Disposition Logic
    const handleDisposition = async (status: string) => {
        if (!connectedLead) return;

        // Optimistic UI update
        alert(`Disposed as: ${status}`); // Placeholder for real logic (e.g. save to DB and next lead)

        // In Auto Dialer, hanging up usually means we are ready for next? 
        // Or if we are in "Dialing" mode, maybe it resumes?
        // For now, just clear the active call screen.
        handleHangup();
    };

    useEffect(() => {
        fetchNumbers();
    }, []);

    // Initialize Twilio Device
    useEffect(() => {
        const setupDevice = async () => {
            try {
                const res = await fetch('https://gibbor-voice-production.up.railway.app/token');
                const { token } = await res.json();

                const newDevice = new Device(token, {
                    logLevel: 1,
                    codecPreferences: [Device.AudioCodec.Opus, Device.AudioCodec.PCMU]
                });

                newDevice.on('ready', () => console.log('Device ready'));
                newDevice.on('error', (err) => console.error('Twilio error', err));

                // Handle Incoming Bridge (The "Connect" call)
                newDevice.on('incoming', (conn) => {
                    console.log('Incoming bridge connection:', conn);
                    const params = (conn as any).parameters || {};
                    const leadId = params.leadId; // Getting leadID from backend!

                    conn.accept(); // Auto-answer the bridge
                    setActiveConnection(conn);
                    setCallStatus('Connected');

                    // If we have a leadId, try to find it in our current lines or fetch it
                    if (leadId && leadId !== 'unknown') {
                        console.log("Bridged with lead:", leadId);
                        // For now, assuming lines has the lead info, or we just fetch it.
                        // Simple: Fetch lead details
                        fetchLeadDetails(leadId);
                    } else {
                        setConnectedLead({ name: 'Unknown Lead', phone: 'Unknown' });
                    }
                });

                newDevice.on('disconnect', () => {
                    setCallStatus('Idle');
                    setActiveConnection(null);
                    setConnectedLead(null);
                });

                await newDevice.register();
                setDevice(newDevice);

            } catch (e) {
                console.error("Device setup error", e);
            }
        };
        setupDevice();

        return () => {
            if (device) device.destroy();
        };
    }, []);




    const toggleDialer = async () => {
        if (!selectedCampaignId && !isDialing) {
            alert("Please select a campaign first.");
            return;
        }
        if (!selectedCallerId && !isDialing) {
            alert("Please select a Caller ID.");
            return;
        }

        setIsDialing(!isDialing);

        if (!isDialing) {
            // Start Dialing - Real Backend Call
            try {
                const res = await fetch('https://gibbor-voice-production.up.railway.app/auto-dialer/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        campaignId: selectedCampaignId,
                        callerId: selectedCallerId
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.leads && data.leads.length > 0) {
                        // Map backend leads to UI lines
                        const newLines = data.leads.map((l: any, index: number) => ({
                            id: index + 1,
                            status: 'Dialing...',
                            lead: l
                        }));
                        // Fill remaining slots if < 3 leads
                        while (newLines.length < 3) {
                            newLines.push({ id: newLines.length + 1, status: 'Idle', lead: null });
                        }
                        setLines(newLines);
                    } else {
                        alert(data.message || "No leads found to dial.");
                        setIsDialing(false); // Reset if no leads
                    }
                } else {
                    console.error("Failed to start dialing");
                    setIsDialing(false);
                }
            } catch (e) {
                console.error(e);
                setIsDialing(false);
            }
        } else {
            // Stop Dialing (Reset UI)
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

                    {/* Active Call Overlay (Disposition UI) */}
                    {activeConnection && connectedLead && (
                        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[80vh]">

                                {/* Call Info & Controls */}
                                <div className="w-full md:w-1/3 bg-gray-900 p-8 text-white flex flex-col items-center justify-center relative">
                                    <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                        <Users className="w-10 h-10" />
                                    </div>
                                    <h2 className="text-3xl font-bold text-center mb-2">{connectedLead.name}</h2>
                                    <p className="text-indigo-300 font-mono text-xl mb-8">{connectedLead.phone}</p>

                                    <div className="flex gap-4 mb-12">
                                        <button
                                            onClick={() => setIsMuted(!isMuted)}
                                            className={`p-4 rounded-full ${isMuted ? 'bg-white text-gray-900' : 'bg-gray-800 hover:bg-gray-700'}`}
                                        >
                                            {isMuted ? <MicOff /> : <Mic />}
                                        </button>
                                        <button
                                            onClick={handleHangup}
                                            className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white"
                                        >
                                            <PhoneOff className="w-8 h-8" />
                                        </button>
                                    </div>

                                    <div className="absolute bottom-6 text-sm text-gray-500">
                                        Auto-Connected
                                    </div>
                                </div>

                                {/* Disposition Panel */}
                                <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
                                    <h3 className="text-xl font-bold text-gray-800 mb-6">Select Disposition</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        {['No Contestó', 'Buzón', 'Número Equivocado', 'Volver a Llamar', 'Cita Agendada', 'Venta Cerrada', 'No Interesado'].map(status => (
                                            <button
                                                key={status}
                                                onClick={() => handleDisposition(status)}
                                                className="p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all text-left font-medium text-gray-700"
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="mt-8">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                                        <textarea
                                            className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 min-h-[150px]"
                                            placeholder="Add call notes..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
            </div >
        </div >
    );
}
