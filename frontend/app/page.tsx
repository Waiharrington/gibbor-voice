'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Dialpad from '@/components/Dialpad';
import MessagesPanel from '@/components/MessagesPanel';
import CampaignManager from '@/components/CampaignManager';
import { Device } from '@twilio/voice-sdk';
import { Phone, PhoneOff, Mic, MicOff, Search, ArrowUpRight, ArrowDownLeft, MoreVertical, Download, MessageSquare, Copy, MapPin, Building, Info, FileText, Send } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/utils/supabaseClient';
import { CALL_STATUSES } from '@/constants/statuses';

// Simple Custom Audio Player Component
function AudioPlayer({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(src);

    // Load metadata
    audioRef.current.addEventListener('loadedmetadata', () => {
      setDuration(audioRef.current?.duration || 0);
    });

    audioRef.current.addEventListener('timeupdate', () => {
      setProgress(audioRef.current?.currentTime || 0);
    });

    audioRef.current.addEventListener('ended', () => {
      setIsPlaying(false);
      setProgress(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
    });

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }
  }, [src]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = newTime;
    setProgress(newTime);
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="mt-4 bg-gray-50 rounded-xl p-3 flex items-center space-x-3 border border-gray-100">
      <button
        onClick={togglePlay}
        className="w-8 h-8 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-gray-700 transition-colors shrink-0"
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <div className="h-3 w-3 bg-white rounded-sm" /> // Stop/Pause icon substitute
        ) : (
          <div className="w-0 h-0 border-t-4 border-t-transparent border-l-8 border-l-white border-b-4 border-b-transparent ml-1" /> // Play icon
        )}
      </button>

      <div className="flex-1 flex flex-col justify-center">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={progress}
          onChange={handleSeek}
          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
          aria-label="Seek"
        />
      </div>

      <span className="text-xs text-gray-500 font-medium tabular-nums min-w-[32px]">
        {formatTime(duration)}
      </span>
    </div>
  );
}

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Multi-select Status State
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);


  const [isKeypadOpen, setIsKeypadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Campaigns & Dialer State
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [currentLead, setCurrentLead] = useState<any | null>(null);
  const [dialerMode, setDialerMode] = useState(false);

  // Reset selected statuses when currentLead changes
  useEffect(() => {
    if (currentLead?.status) {
      // If the backend stores multiple as comma-separated
      setSelectedStatuses(currentLead.status.split(',').map((s: string) => s.trim()));
    } else {
      setSelectedStatuses([]);
    }
  }, [currentLead?.id]); // Only reset when ID changes

  // View Navigation State (Persistent Call)
  const [currentView, setCurrentView] = useState<'calls' | 'messages' | 'campaigns'>('calls');
  const [initialConvId, setInitialConvId] = useState<string | null>(null);

  // History Stack for Back functionality
  const [leadHistory, setLeadHistory] = useState<any[]>([]);


  const handleViewChange = (view: string) => {
    setCurrentView(view as 'calls' | 'messages' | 'campaigns');
    if (view === 'calls') setInitialConvId(null);
  };

  const handleGoToMessage = (number: string | null) => {
    if (!number) return;
    setInitialConvId(number);
    setCurrentView('messages');
  };

  // --- Campaign & Dialer Logic ---

  const fetchNextLead = async (campaignId: string) => {
    try {
      // 1. Push current lead to history BEFORE fetching next, if it exists and we are not just starting
      // We check if currentLead is already the last item in history to avoid dupes if re-renders happen?
      // Simple verification: Only push if not null.
      if (currentLead) {
        setLeadHistory(prev => [...prev, currentLead]);
      }

      // Reset current lead temporarily to show loading state if needed, or handle optimistic UI
      setCurrentLead(null);

      const res = await fetch(`https://gibbor-voice-production.up.railway.app/campaigns/${campaignId}/next-lead`);
      if (!res.ok) throw new Error('Failed to fetch next lead');
      const lead = await res.json();

      if (lead) {
        setCurrentLead(lead);
        if (lead.phone) setDialedNumber(lead.phone);
      } else {
        // No more leads
        setCurrentLead(null);
        alert("No more pending leads in this campaign.");
        setDialerMode(false);
      }
    } catch (err) {
      console.error("Error fetching lead:", err);
      // alert("Error fetching next lead. See console.");
      setDialerMode(false);
    }
  };

  const handleStartDialer = (campaignId: string) => {
    setActiveCampaignId(campaignId);
    setDialerMode(true);
    // Fetch first lead
    fetchNextLead(campaignId);
  };

  const handleLeadDisposition = async (statusId: string, notes?: string) => {
    if (!currentLead) return;

    // Toggle Selection
    let newStatuses;
    if (selectedStatuses.includes(statusId)) {
      newStatuses = selectedStatuses.filter(id => id !== statusId);
    } else {
      newStatuses = [...selectedStatuses, statusId];
    }
    setSelectedStatuses(newStatuses);

    const statusString = newStatuses.join(', ');

    // Optimistic update / Log disposition
    try {
      // Update local state immediately for UI responsiveness
      setCurrentLead((prev: any) => prev ? { ...prev, status: statusString } : null);

      await fetch(`https://gibbor-voice-production.up.railway.app/leads/${currentLead.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusString, notes })
      });

      // Auto-fetch next lead REMOVED per user request
      if (activeCampaignId) {
        // fetchNextLead(activeCampaignId);
      }
    } catch (err) {
      console.error("Error updating lead:", err);
      // Revert on error (optional, skipping for simplicity)
      alert("Failed to update lead status status.");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    // You might want to add a toast notification here
  };

  const handleNextLead = () => {
    if (activeCampaignId) fetchNextLead(activeCampaignId);
  };

  const handleSkipLead = () => {
    handleNextLead();
  };

  const handleBackLead = async () => {
    if (leadHistory.length === 0) {
      alert("No previous leads in history.");
      return;
    }

    const prevLead = leadHistory[leadHistory.length - 1]; // Get last
    const newHistory = leadHistory.slice(0, -1); // Remove last

    setLeadHistory(newHistory);
    setCurrentLead(prevLead);

    // Optionally refetch freshest data for this lead from backend
    // to ensure we see the correct status if we just updated it.
    try {
      const res = await fetch(`https://gibbor-voice-production.up.railway.app/leads/${prevLead.id}`);
      if (res.ok) {
        const freshLead = await res.json();
        if (freshLead) setCurrentLead(freshLead);
      }
    } catch (e) { console.error("Error refreshing back lead", e); }
  };

  // Fetch token & History
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        // 1. Get Token
        const tokenRes = await fetch('https://gibbor-voice-production.up.railway.app/token');
        if (!tokenRes.ok) throw new Error('Failed to fetch token');
        const tokenData = await tokenRes.json();
        setToken(tokenData.token);
        setIdentity(tokenData.identity);

        // 2. Get History
        const historyRes = await fetch('https://gibbor-voice-production.up.railway.app/history/calls');
        if (!historyRes.ok) throw new Error('Failed to fetch history');
        const historyData = await historyRes.json();
        setCalls(historyData);
      } catch (error: any) {
        console.error('Error initializing:', error);
        setError(error.message || 'Failed to connect to server');
      } finally {
        setIsLoading(false);
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

  const [duration, setDuration] = useState(0);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeCall && callStatus.startsWith('In Call')) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [activeCall, callStatus]);

  const formatDuration = (sec: number) => {
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${min}:${s < 10 ? '0' : ''}${s}`;
  };

  const [dialedNumber, setDialedNumber] = useState<string>('');

  const handleCall = async (number: string, callerId?: string) => {
    if (!device) return;
    setDialedNumber(number); // Store for display
    try {
      setCallStatus('Calling ' + number + '...');
      const params: any = { To: number };
      // Use appCallerId to avoid potential Twilio param conflicts
      if (callerId) params.appCallerId = callerId;
      console.log("[Client] Connecting with params:", params);

      const call = await device.connect({ params });

      setCallStatus('Dialing...'); // Immediate UI update
      // Set active call immediately to show UI controls (including Keypad)
      setActiveCall(call);

      call.on('accept', () => {
        setCallStatus('In Call');
        // setActiveCall(call); // Already set
      });

      call.on('disconnect', () => {
        setCallStatus('Ready');
        setActiveCall(null);
        setIsMuted(false);
        setDialedNumber('');
        setIsKeypadOpen(false); // Reset keypad state
      });

      call.on('cancel', () => {
        setCallStatus('Ready');
        setActiveCall(null);
        setDialedNumber('');
      });

      call.on('error', (error: any) => {
        console.error('Call Error:', error);
        setCallStatus('Call Error');
        setActiveCall(null);
        setDialedNumber('');
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
      <Sidebar currentView={currentView} onViewChange={handleViewChange} />

      {currentView === 'calls' && !dialerMode && (
        <>
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
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mr-2"></div>
                  Loading...
                </div>
              ) : error ? (
                <div className="p-6 text-center text-red-500 bg-red-50 m-4 rounded-lg text-sm">
                  <p className="font-semibold">Connection Error</p>
                  <p>{error}</p>
                  <button onClick={() => window.location.reload()} className="mt-2 text-red-700 underline">Retry</button>
                </div>
              ) : (
                calls.map((call) => (
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
                ))
              )}
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
                  <div className="flex space-x-2 relative">
                    <button
                      onClick={() => handleGoToMessage(selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from)}
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-cyan-600 transition-colors"
                      title="Message"
                      aria-label="Message"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleCall(selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from)}
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-green-600 transition-colors"
                      title="Call"
                      aria-label="Call"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                        title="More options"
                        aria-label="More options"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      {isMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 border border-gray-100">
                          {selectedCall.recording_url ? (
                            <a
                              href={selectedCall.recording_url}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                              onClick={() => setIsMenuOpen(false)}
                            >
                              <Download className="w-4 h-4 mr-2" /> Download Recording
                            </a>
                          ) : (
                            <span className="block px-4 py-2 text-sm text-gray-400 italic">No recording available</span>
                          )}
                        </div>
                      )}
                    </div>
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
                          <div className="mt-4 flex items-center space-x-2">
                            <div className="flex-1">
                              <AudioPlayer src={selectedCall.recording_url} />
                            </div>
                            <a
                              href={selectedCall.recording_url}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 hover:text-cyan-600 transition-colors"
                              title="Download Recording"
                              aria-label="Download Recording"
                            >
                              <Download className="w-5 h-5" />
                            </a>
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
        </>
      )}

      {currentView === 'messages' && (
        <MessagesPanel key={initialConvId || 'messages'} initialConversationId={initialConvId} />
      )}

      {currentView === 'campaigns' && !dialerMode && (
        <CampaignManager onStartDialer={handleStartDialer} />
      )}

      {/* DIALER MODE LAYOUT */}
      {dialerMode ? (
        !currentLead ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50 flex-col">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mb-4"></div>
            <p className="text-gray-500 font-medium">Fetching next lead...</p>
            <button onClick={() => setDialerMode(false)} className="mt-8 text-red-400 hover:text-red-500 text-sm">Cancel</button>
          </div>
        ) : (
          <div className="flex-1 flex bg-gray-50">
            {/* CENTER: Lead Info (Editable) */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                {/* Header Info */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{currentLead.name || 'Unknown'}</h1>
                    <p className="text-lg text-cyan-600 font-mono mt-1 flex items-center font-bold">
                      <Phone className="w-4 h-4 mr-2" />
                      {currentLead.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 uppercase tracking-wide">
                      <Info className="w-3 h-3 mr-1.5" />
                      Power Dialer Active v2.5
                    </span>
                  </div>
                </div>

                {/* Grid Fields (Editable) - Single Row Layout */}
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="col-span-1 space-y-1">
                    <label className="text-xs font-bold text-black uppercase tracking-wider">Referred By</label>
                    <input
                      type="text"
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-xs"
                      defaultValue={currentLead.referred_by || ''}
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <label className="text-xs font-bold text-black uppercase tracking-wider">City</label>
                    <div className="relative">
                      <Building className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-8 p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-xs"
                        defaultValue={currentLead.city || ''}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-bold text-black uppercase tracking-wider">Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-8 p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-xs"
                        defaultValue={currentLead.address || ''}
                      />
                    </div>
                  </div>
                </div>

                {/* Text Areas */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block">General Info</label>
                    <textarea
                      rows={3}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 leading-relaxed focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all resize-none"
                      defaultValue={currentLead.general_info || ''}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block">Rep Observations</label>
                    <textarea
                      rows={2}
                      className="w-full p-3 bg-yellow-50 border border-yellow-100 rounded-xl text-gray-700 leading-relaxed focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 transition-all resize-none"
                      defaultValue={currentLead.rep_notes || ''}
                    />
                  </div>

                  <div className="relative group">
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block">
                      TLMK Observations (History)
                    </label>
                    <div className="p-3 bg-blue-50 rounded-xl text-gray-700 text-sm leading-relaxed border border-blue-100 max-h-32 overflow-y-auto w-full">
                      {currentLead.tlmk_notes || 'No history'}
                    </div>
                  </div>

                  {/* NEW COMMENTS FIELD */}
                  <div>
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block flex items-center justify-between">
                      <span>Call Comments (Current)</span>
                      <button onClick={() => {
                        const noteInput = document.getElementById('current-call-notes') as HTMLTextAreaElement;
                        if (noteInput) handleCopy(noteInput.value);
                      }} className="text-cyan-600 hover:text-cyan-700 text-xs font-bold flex items-center" title="Copy">
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </button>
                    </label>
                    <textarea
                      id="current-call-notes"
                      rows={4}
                      placeholder="Write notes for this call..."
                      className="w-full p-3 bg-white border border-gray-300 rounded-xl text-gray-900 leading-relaxed focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all shadow-sm resize-none"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* RIGHT: Controls & Status */}
            <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full shadow-2xl z-20">

              {/* TOP: Call Controls */}
              <div className="p-5 border-b border-gray-100 bg-gray-50 flex flex-col items-center">

                {/* Active Call State or Start Call Button */}
                {activeCall ? (
                  <div className="w-full flex flex-col items-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="text-center">
                      <span className="inline-flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                      </span>
                      <span className="ml-2 font-mono text-xl font-bold text-gray-800">{formatDuration(duration)}</span>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mt-1 font-semibold">{callStatus}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 w-full">
                      <button onClick={toggleMute} className={`flex flex-col items-center justify-center h-14 rounded-xl transition-all border ${isMuted ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                      <button onClick={() => setIsKeypadOpen(!isKeypadOpen)} className={`flex flex-col items-center justify-center h-14 rounded-xl transition-all border ${isKeypadOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        <div className="grid grid-cols-3 gap-0.5 w-4 h-4">
                          {[...Array(9)].map((_, i) => <div key={i} className={`w-1 h-1 rounded-full ${isKeypadOpen ? 'bg-white' : 'bg-gray-400'}`} />)}
                        </div>
                      </button>
                      <button onClick={handleHangup} className="col-span-1 flex flex-col items-center justify-center h-14 rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-md transition-all active:scale-95">
                        <PhoneOff className="w-6 h-6" />
                      </button>
                    </div>

                    {/* In-Call Keypad (Overlay or Expand) */}
                    {isKeypadOpen && (
                      <div className="grid grid-cols-3 gap-2 w-full pt-2">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                          <button
                            key={digit}
                            onClick={() => activeCall.sendDigits(digit)}
                            className="h-10 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-lg font-bold text-gray-700 transition-colors"
                          >
                            {digit}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full">
                    <button
                      onClick={() => handleCall(currentLead.phone)}
                      className="w-full py-4 bg-green-500 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-green-600 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center active:scale-95 transform"
                    >
                      <Phone className="w-5 h-5 mr-2" />
                      Call Lead
                    </button>
                  </div>
                )}

                {!activeCall && (
                  <div className="w-full mt-3 flex justify-between text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                    <button onClick={() => setDialerMode(false)} className="hover:text-red-500 transition-colors">Exit Dialer</button>
                    <span>{identity}</span>
                  </div>
                )}
              </div>

              {/* MIDDLE: Status List (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-3 bg-gray-50/50">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 mb-2 block">Disposition (Multi-select)</label>
                <div className="space-y-1.5">
                  {CALL_STATUSES.map(status => {
                    const isSelected = selectedStatuses.includes(status.id);
                    return (
                      <button
                        key={status.id}
                        onClick={() => {
                          const noteInput = document.getElementById('current-call-notes') as HTMLTextAreaElement;
                          handleLeadDisposition(status.id, noteInput?.value || '');
                          // Do NOT clear notes on multi-select toggle
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-all border text-sm font-bold flex items-center justify-between group shadow-sm ${isSelected ? 'bg-blue-50 border-blue-500 text-blue-900' : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300'}`}
                        style={{ borderLeftWidth: '4px', borderLeftColor: status.color.includes('green') ? '#22c55e' : status.color.includes('red') ? '#ef4444' : status.color.includes('yellow') ? '#eab308' : '#3b82f6' }}
                      >
                        <span className="flex-1">{status.label}</span>
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full border-2 border-blue-600 bg-blue-600 flex items-center justify-center text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-gray-300 group-hover:border-gray-400 transition-colors"></div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* BOTTOM: Nav */}
              <div className="p-3 bg-white border-t border-gray-200 grid grid-cols-3 gap-2">
                <button onClick={handleBackLead} className="flex flex-col items-center justify-center p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowDownLeft className="w-4 h-4 mb-1 rotate-90" />
                  <span className="text-[10px] uppercase font-bold tracking-wider">Back</span>
                </button>
                <button onClick={handleSkipLead} className="flex flex-col items-center justify-center p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowDownLeft className="w-4 h-4 mb-1 rotate-[-90deg]" />
                  <span className="text-[10px] uppercase font-bold tracking-wider">Skip</span>
                </button>
                <button onClick={handleNextLead} className="flex flex-col items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <ArrowDownLeft className="w-4 h-4 mb-1 rotate-[-135deg]" /> {/* Next Icon Proxy */}
                  <span className="text-[10px] uppercase font-bold tracking-wider">Next</span>
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        // Default Right Panel (Dialpad/Active Call) - ONLY SHOW IF NOT IN DIALER MODE
        <div className="w-96 bg-white flex flex-col p-8">
          {activeCall ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-300">
              <div className="w-24 h-24 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center text-3xl font-bold shadow-sm">
                {/* Initials or Icon */}
                <Phone className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {/* Prioritize dialedNumber for outbound, otherwise use call parameters */}
                  {dialedNumber || activeCall.parameters?.From || activeCall.parameters?.To || 'Unknown'}
                </h2>
                <p className="text-green-600 font-medium mt-2 animate-pulse">{callStatus}</p>
                {callStatus.startsWith('In Call') && (
                  <p className="text-3xl font-mono text-gray-600 mt-2">{formatDuration(duration)}</p>
                )}
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
                      aria-label="Answer"
                      title="Answer"
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
                      aria-label="Reject"
                      title="Reject"
                    >
                      <PhoneOff className="w-8 h-8" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"} title={isMuted ? "Unmute" : "Mute"} className={`flex flex-col items-center justify-center w-16 h-16 rounded-full transition-all ${isMuted ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>

                    <button
                      onClick={() => setIsKeypadOpen(!isKeypadOpen)}
                      className={`flex flex-col items-center justify-center w-16 h-16 rounded-full transition-all ${isKeypadOpen ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      title="Keypad"
                      aria-label="Keypad"
                    >
                      <div className="grid grid-cols-3 gap-0.5 w-6 h-6">
                        {[...Array(9)].map((_, i) => <div key={i} className={`w-1 h-1 rounded-full ${isKeypadOpen ? 'bg-white' : 'bg-gray-500'}`} />)}
                      </div>
                    </button>

                    <button onClick={handleHangup} aria-label="Hangup" title="Hangup" className="col-start-3 flex flex-col items-center justify-center w-16 h-16 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all">
                      <PhoneOff className="w-8 h-8" />
                    </button>
                  </>
                )}
              </div>

              {/* In-Call Keypad Overlay */}
              {isKeypadOpen && (
                <div className="mt-8 grid grid-cols-3 gap-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => {
                        if (activeCall) {
                          activeCall.sendDigits(digit);
                          setDuration((prev) => prev); // Force re-render if needed? No, just visual feedback
                        }
                      }}
                      className="w-14 h-14 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-xl font-medium text-gray-700 transition-colors active:bg-gray-200"
                    >
                      {digit}
                    </button>
                  ))}
                </div>
              )}

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
      )}
    </div >
  );
}
