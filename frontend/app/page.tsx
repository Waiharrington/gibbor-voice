'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Dialpad from '@/components/Dialpad';
import MessagesPanel from '@/components/MessagesPanel';
import { Device } from '@twilio/voice-sdk';
import { Phone, PhoneOff, Mic, MicOff, Search, ArrowUpRight, ArrowDownLeft, MoreVertical, Download, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/utils/supabaseClient';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Navigation State (Persistent Call)
  const [currentView, setCurrentView] = useState<'calls' | 'messages'>('calls');
  const [initialConvId, setInitialConvId] = useState<string | null>(null);

  const handleViewChange = (view: string) => {
    setCurrentView(view as 'calls' | 'messages');
    if (view === 'calls') setInitialConvId(null);
  };

  const handleGoToMessage = (number: string | null) => {
    if (!number) return;
    setInitialConvId(number);
    setCurrentView('messages');
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

      call.on('accept', () => {
        setCallStatus('In Call');
        setActiveCall(call);
      });
      // ... (rest of listeners)

      call.on('disconnect', () => {
        setCallStatus('Ready');
        setActiveCall(null);
        setIsMuted(false);
        setDialedNumber('');
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

      {currentView === 'calls' ? (
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
      ) : (
        <MessagesPanel key={initialConvId || 'messages'} initialConversationId={initialConvId} />
      )}

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
                    onClick={() => handleGoToMessage(dialedNumber || activeCall.parameters?.From || activeCall.parameters?.To)}
                    className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-gray-600 text-white hover:bg-gray-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                    title="Message"
                    aria-label="Message"
                  >
                    <MessageSquare className="w-6 h-6" />
                  </button>

                  <button onClick={handleHangup} aria-label="Hangup" title="Hangup" className="col-start-3 flex flex-col items-center justify-center w-16 h-16 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all">
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
    </div >
  );
}
