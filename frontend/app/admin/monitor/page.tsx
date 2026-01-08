'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Phone, Users, Volume2, MicOff, RefreshCw, Activity } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { Device } from '@twilio/voice-sdk';

export default function MonitorPage() {
    const [activeCalls, setActiveCalls] = useState<any[]>([]);
    const [listeningTo, setListeningTo] = useState<string | null>(null);
    const [device, setDevice] = useState<Device | null>(null);
    const [status, setStatus] = useState('Idle');

    // 1. Fetch Active Calls (Dialing or In-Progress)
    const fetchActiveCalls = async () => {
        // We look for calls created in last 24 hours that are not 'completed' or 'failed'
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
            .from('calls')
            .select('*')
            .gte('created_at', today.toISOString())
            .in('status', ['dialing', 'in-progress', 'bridged', 'ringing'])
            .order('created_at', { ascending: false });

        if (data) setActiveCalls(data);
    };

    // 2. Realtime Subscription
    useEffect(() => {
        fetchActiveCalls();

        const channel = supabase
            .channel('active-calls')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, (payload) => {
                console.log('Call update:', payload);
                fetchActiveCalls();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    // 3. Init Twilio Device (for Listening)
    useEffect(() => {
        const setupDevice = async () => {
            try {
                // We need a specific identity for Admin? 
                // Currently server assumes 'client:admin' or fallback. 
                // Let's assume we are just a client.
                const res = await fetch('https://gibbor-voice-production.up.railway.app/token?identity=admin@gibborcenter.com');
                // Note: /token endpoint might ignore identity param if hardcoded in backend.
                // Assuming backend /token is updated or we use default 'agent' identity?
                // If we use 'agent' identity, we might conflict with real agents if they use same ID.
                // CHECK: Backend /token uses hardcoded 'agent'.
                // ACTION: I need to update /token to accept identity query param to uniqueify sessions.
                // For now, let's try.

                const { token } = await res.json();
                const newDevice = new Device(token);

                newDevice.on('ready', () => setStatus('Ready to Monitor'));
                newDevice.on('connect', () => setStatus('Monitoring...'));
                newDevice.on('disconnect', () => {
                    setStatus('Idle');
                    setListeningTo(null);
                });

                await newDevice.register();
                setDevice(newDevice);

            } catch (e) {
                console.error("Device setup error", e);
            }
        };
        setupDevice();

        return () => { if (device) device.destroy(); }
    }, []);

    const handleListen = async (call: any) => {
        if (!device) return alert("Phone not ready");

        // This triggers the Backend to call US (the Admin) and put us in the conference
        try {
            setListeningTo(call.sid);
            await fetch(`https://gibbor-voice-production.up.railway.app/calls/${call.sid}/monitor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminIdentity: 'admin@gibborcenter.com' })
            });
            // Result: Our Twilio Device should ring (auto-answer?) or we catch 'incoming'?
            // If backend does client.calls.create(to: client:admin...), we get an incoming call event here!
        } catch (e) {
            console.error(e);
            alert("Failed to start monitor");
        }
    };

    // Auto-answer incoming monitor connections
    useEffect(() => {
        if (!device) return;
        device.on('incoming', (conn) => {
            console.log("Incoming monitor connection...");
            conn.accept();
        });
    }, [device]);

    return (
        <div className="flex h-screen bg-gray-50">
            <Sidebar userRole="admin" />
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Live Monitor</h1>
                        <p className="text-gray-500">Listen to active agent calls.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${status.includes('Monitor') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            <Activity className="w-4 h-4" />
                            {status}
                        </div>
                    </div>
                </div>

                <div className="grid gap-4">
                    {activeCalls.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 text-gray-400">
                            No active calls right now.
                        </div>
                    ) : (
                        activeCalls.map((call) => (
                            <div key={call.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${call.status === 'bridged' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                        <Phone className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{call.recipient}</h3>
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <span className="capitalize">{call.status}</span>
                                            <span>•</span>
                                            <span>{new Date(call.created_at).toLocaleTimeString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    {call.status === 'bridged' || call.status === 'in-progress' ? (
                                        <button
                                            onClick={() => handleListen(call)}
                                            disabled={listeningTo === call.sid}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Volume2 className="w-4 h-4" />
                                            {listeningTo === call.sid ? 'Connecting...' : 'Listen In'}
                                        </button>
                                    ) : (
                                        <span className="text-gray-400 text-sm italic">Connecting...</span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
