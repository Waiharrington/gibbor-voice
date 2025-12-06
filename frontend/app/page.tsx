'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import Dialpad from '@/components/Dialpad';
import { Device } from '@twilio/voice-sdk';
import { Phone, PhoneOff, Mic, MicOff, Search, Clock, ArrowUpRight, ArrowDownLeft, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/utils/supabaseClient';

export default function Home() {
  const [device, setDevice] = useState<Device | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<string>('Idle');
  const [identity, setIdentity] = useState<string>('');

  // History State
  const [calls, setCalls] = useState<any[]>([]);
  const [selectedCall, setSelectedCall] = useState<any | null>(null);

  // Fetch token & History
  useEffect(() => {
    const init = async () => {
      try {
        // 1. Get Token
        const tokenRes = await fetch('https://gibbor-voice-production.up.railway.app/token');
        const tokenData = await tokenRes.json();
        setToken(tokenData.token);
        setIdentity(tokenData.identity);

        // 2. Get History
        const historyRes = await fetch('https://gibbor-voice-production.up.railway.app/history/calls');
        const historyData = await historyRes.json();
        setCalls(historyData);
      } catch (error) {
        console.error('Error initializing:', error);
      }
    };
    init();

    // 3. Realtime Subscription
    const channel = supabase
      .channel('calls_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (payload) => {
        console.log('New call logged:', payload.new);
        setCalls((prev) => [payload.new, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, (payload) => {
        // Handle updates (e.g. recording_url added)
        console.log('Call updated:', payload.new);
        setCalls((prev) => prev.map(call => call.id === payload.new.id ? payload.new : call));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Initialize Twilio Device
  useEffect(() => {
    if (token && !device) {
      const newDevice = new Device(token, { logLevel: 1 });

      newDevice.on('registered', () => {
        console.log('Twilio Device Registered');
        setCallStatus('Ready');
      });

      newDevice.on('error', (error) => {
        console.error('Twilio Device Error:', error);
        setCallStatus('Error: ' + error.message);
      });

      newDevice.on('incoming', (call) => {
        setCallStatus('Incoming Call...');
        setActiveCall(call);
        call.on('disconnect', () => {
          setActiveCall(null);
          setCallStatus('Ready');
        });
        call.on('cancel', () => {
          setActiveCall(null);
          setCallStatus('Ready');
        });
      });

      newDevice.register();
      setDevice(newDevice);
    }
    return () => device?.destroy();
  }, [token, device]);

  const handleCall = async (number: string) => {
    if (!device) return;
    try {
      setCallStatus('Calling ' + number + '...');
      const call = await device.connect({ params: { To: number } });

      call.on('accept', () => {
        setCallStatus('In Call: ' + number);
        setActiveCall(call);
      });

      call.on('disconnect', () => {
        setCallStatus('Ready');
        setActiveCall(null);
        setIsMuted(false);
      });

      call.on('error', (error: any) => {
        console.error('Call Error:', error);
        setCallStatus('Call Error');
        setActiveCall(null);
      });

    } catch (error) {
      console.error('Error making call:', error);
      setCallStatus('Error making call');
    }
  };

  const handleHangup = () => activeCall?.disconnect();
  const toggleMute = () => {
    if (activeCall) {
      const newMuted = !isMuted;
      activeCall.mute(newMuted);
      setIsMuted(newMuted);
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* 1. Sidebar */}
      <Sidebar />

      {/* 2. Call List (Left) */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        {/* Search Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-full bg-gray-100 pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition-shadow"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {calls.map((call) => (
            <div
              key={call.id}
              onClick={() => setSelectedCall(call)}
              className={`p-4 flex items-center cursor-pointer transition-colors border-l-4 ${selectedCall?.id === call.id
                ? 'bg-cyan-50 border-cyan-500'
                : 'hover:bg-gray-50 border-transparent'
                }`}
            >
              {/* Avatar */}
              <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0 mr-3 ${call.direction === 'inbound' ? 'bg-purple-500' : 'bg-gray-500' // Different color for distinction
                }`}>
                <Phone className="w-4 h-4" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className={`text-sm font-semibold truncate ${selectedCall?.id === call.id ? 'text-gray-900' : 'text-gray-700'}`}>
                    {call.direction === 'outbound' ? call.to : call.from}
                  </h3>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {call.created_at && format(new Date(call.created_at), 'HH:mm')}
                  </span>
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  {call.direction === 'outbound' ? (
                    <ArrowUpRight className="w-3 h-3 mr-1 text-green-500" />
                  ) : (
                    <ArrowDownLeft className="w-3 h-3 mr-1 text-cyan-500" />
                  )}
                  <span>{call.status || 'unknown'}</span>
                  {call.duration && (
                    <span className="ml-1 text-gray-400">• {call.duration}s</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Center Panel (Details) */}
      <div className="flex-1 flex flex-col bg-white border-r border-gray-200">
        {selectedCall ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <header className="h-16 border-b border-gray-200 flex justify-between items-center px-6">
              <h2 className="text-lg font-medium text-gray-800">
                {selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from}
              </h2>
              <div className="flex space-x-2">
                <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                  <Phone className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Content */}
            <div className="flex-1 p-8 bg-gray-50">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 max-w-2xl">
                <div className="flex items-start space-x-4">
                  <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">
                      {selectedCall.direction === 'outbound' ? 'Outbound Call' : 'Inbound Call'}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedCall.created_at && format(new Date(selectedCall.created_at), 'PPP p')}
                    </p>
                    <p className="text-sm text-gray-600 mt-4">
                      {selectedCall.duration ? `${selectedCall.duration} seconds` : 'Duration not logged'}
                    </p>

                    {/* Recording Player (Placeholder logic until backend is ready) */}
                    {selectedCall.recording_url && (
                      <div className="mt-4 bg-gray-100 rounded-full p-2 flex items-center">
                        <audio controls src={selectedCall.recording_url} className="w-full h-8" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
            Select a call to view details
          </div>
        )}
      </div>

      {/* 4. Right Panel (Dialpad/Active Call) */}
      <div className="w-96 bg-white flex flex-col p-8">
        {activeCall ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="w-24 h-24 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center text-3xl font-bold shadow-sm">
              {/* Initials or Icon */}
              <Phone className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {activeCall.parameters?.From || activeCall.parameters?.To || 'Unknown'}
              </h2>
              <p className="text-green-600 font-medium mt-2 animate-pulse">{callStatus}</p>
            </div>

            <div className="grid grid-cols-3 gap-6 w-full max-w-xs">
              {callStatus === 'Incoming Call...' ? (
                <>
                  <button
                    onClick={() => {
                      activeCall.accept();
                      setCallStatus('In Call');
                    }}
                    className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-green-500 text-white hover:bg-green-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                  >
                    <Phone className="w-8 h-8" />
                  </button>
                  <button
                    onClick={() => {
                      activeCall.reject();
                      setActiveCall(null);
                      setCallStatus('Ready');
                    }}
                    className="col-start-3 flex flex-col items-center justify-center w-16 h-16 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                  >
                    <PhoneOff className="w-8 h-8" />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={toggleMute} className={`flex flex-col items-center justify-center w-16 h-16 rounded-full transition-all ${isMuted ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>

                  <button onClick={handleHangup} className="col-start-3 flex flex-col items-center justify-center w-16 h-16 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all">
                    <PhoneOff className="w-8 h-8" />
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="text-center mb-8">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Make a Call</p>
              <p className="text-sm text-gray-500">Calling as {identity || '...'}</p>
            </div>
            <Dialpad onCall={handleCall} />
          </div>
        )}
      </div>
    </div>
  );
}
