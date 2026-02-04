/* eslint-disable */
'use client';
import { useRouter } from 'next/navigation';

import { useState, useEffect, useRef, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import Dialpad from '@/components/Dialpad';
import MessagesPanel from '@/components/MessagesPanel';
import CampaignManager from '@/components/CampaignManager';
import { Device } from '@twilio/voice-sdk';
import { Phone, PhoneOff, Mic, MicOff, Search, ArrowUpRight, ArrowDownLeft, MoreVertical, Download, MessageSquare, Copy, MapPin, Building, Info, FileText, Send, Clock, X, Activity, Menu, BarChart3, Plus, LogOut, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/utils/supabaseClient';
import { CALL_STATUSES } from '@/constants/statuses';

// --- Local Ringback Tone Generator (Web Audio API) ---
// US Standard Ring: 440Hz + 480Hz, 2s ON, 4s OFF
let audioCtx: AudioContext | null = null;
let ringbackOscillators: OscillatorNode[] = [];
let ringbackGain: GainNode | null = null;

const startRingback = () => {
  stopRingback(); // Ensure clean start
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    ringbackGain = audioCtx.createGain();
    ringbackGain.gain.value = 0.15; // Low volume
    ringbackGain.connect(audioCtx.destination);

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();

    osc1.frequency.value = 440;
    osc2.frequency.value = 480;

    osc1.connect(ringbackGain);
    osc2.connect(ringbackGain);

    // Pulse effect
    const now = audioCtx.currentTime;
    for (let i = 0; i < 10; i++) { // Ring for ~60 seconds max
      const start = now + (i * 6);
      const end = start + 2;
      ringbackGain.gain.setValueAtTime(0.15, start);
      ringbackGain.gain.setValueAtTime(0, end);
    }

    osc1.start();
    osc2.start();

    ringbackOscillators = [osc1, osc2];
  } catch (e) {
    console.error("Failed to start ringback tone:", e);
  }
};

const stopRingback = () => {
  try {
    ringbackOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch (e) { }
    });
    ringbackOscillators = [];
    if (ringbackGain) {
      ringbackGain.disconnect();
      ringbackGain = null;
    }
  } catch (e) {
    console.error("Error stopping ringback:", e);
  }
};
// -----------------------------------------------------

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



const formatCallerID = (phoneNumber: string) => {
  // Determine if we have a messy combined string or just a number
  // Simplest approach: strip non-digits, take last 10, format as (XXX) XXX-XXXX
  const cleaned = phoneNumber.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{1})?(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[2] || cleaned.slice(0, 3)}) ${match[3] || cleaned.slice(3, 6)}-${match[4] || cleaned.slice(6)}`;
  }
  // Fallback for non-matching (e.g. short codes)
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phoneNumber;
};

const getAvatarColor = (name: string) => {
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

function NavIcon({ icon, label, active, onClick, expanded }: { icon: any, label: string, active: boolean, onClick: () => void, expanded?: boolean }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`relative flex items-center ${expanded ? 'justify-start px-4 w-full' : 'justify-center w-12'} h-12 rounded-full mb-3 transition-all duration-300
      ${active ? 'bg-blue-100/50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
      title={!expanded ? label : ''}
    >
      <div className={`z-10 flex items-center justify-center ${active ? 'text-blue-700' : 'text-gray-600'}`}>
        {icon}
      </div>

      {expanded && (
        <motion.span
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="ml-3 text-sm font-medium whitespace-nowrap z-10"
        >
          {label}
        </motion.span>
      )}

      {active && (
        <motion.div
          layoutId="activeNavBG"
          className="absolute inset-0 bg-blue-100 rounded-full z-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

export default function MainDashboard() {
  const router = useRouter();
  const [device, setDevice] = useState<Device | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenFetchedAt, setTokenFetchedAt] = useState<number>(0); // Track token age
  const [activeCall, setActiveCall] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<string>('Inactivo');
  const [identity, setIdentity] = useState<string>('');
  const [callbackNumber, setCallbackNumber] = useState<string | null>(null);

  // History State
  const [calls, setCalls] = useState<any[]>([]);
  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  // const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Multi-select Status State
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);


  const [isKeypadOpen, setIsKeypadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Campaigns & Dialer State
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [currentLead, setCurrentLead] = useState<any | null>(null);
  const [dialerMode, setDialerMode] = useState(false);

  // --- API Configuration ---
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://gibbor-voice-production.up.railway.app';

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
  const [currentView, setCurrentView] = useState<'calls' | 'messages' | 'campaigns' | 'contacts' | 'voicemail' | 'history' | 'reports'>('calls');
  const [searchQuery, setSearchQuery] = useState('');
  const [initialConvId, setInitialConvId] = useState<string | null>(null);

  // Auth Protection
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
        // Fetch Role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUser.id)
          .single();
        if (profile) setUserRole(profile.role);

        // Fallback for hardcoded admin
        const email = currentUser.email?.toLowerCase() || '';
        if (email === 'admin@gibborcenter.com' || email === 'info@gibborcenter.com') {
          setUserRole('admin');
        } else if (!profile) {
          // Default to agent/user if no profile found
          setUserRole('agent');
        }
      }
    };
    checkAuth();
  }, [router]);

  // History Stack for Back functionality
  const [leadHistory, setLeadHistory] = useState<any[]>([]);

  // Messages State (Lifted from MessagesPanel)
  const [messages, setMessages] = useState<any[]>([]);

  // Helper to group messages into conversations
  const getConversationId = (msg: any) => {
    return msg.direction === 'outbound' ? msg.to : msg.from;
  };

  // Derived State: Grouped Conversations
  const conversations = useMemo(() => {
    const groups: { [key: string]: any[] } = {};

    messages.forEach(msg => {
      const id = getConversationId(msg);
      if (!groups[id]) groups[id] = [];
      groups[id].push(msg);
    });

    // Convert to array and sort by latest message
    return Object.entries(groups).map(([id, msgs]) => {
      const lastMsg = msgs[msgs.length - 1];
      return {
        id,
        messages: msgs,
        lastMessage: lastMsg,
        timestamp: new Date(lastMsg.created_at).getTime()
      };
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [messages]);

  // Caller ID State
  const [selectedCallerId, setSelectedCallerId] = useState<string>('');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false); // Sidebar State
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false); // SSR-safe mobile check

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile(); // Check on mount
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch available numbers on mount
  useEffect(() => {
    async function fetchNumbers() {
      try {
        if (user?.id) {
          const res = await fetch(`${API_BASE_URL}/phone-numbers?userId=${user.id}`);
          if (res.ok) {
            const data = await res.json();
            // Handle new object response { numbers: [], callbackNumber: ... }
            const nums = data.numbers || [];
            setAvailableNumbers(nums);
            setCallbackNumber(data.callbackNumber || null);

            // Default to callbackNumber if available, otherwise first number
            if (!localStorage.getItem('gibbor_caller_id')) {
              if (data.callbackNumber && nums.some((n: any) => n.phoneNumber === data.callbackNumber)) {
                setSelectedCallerId(data.callbackNumber);
              } else if (nums.length > 0) {
                setSelectedCallerId(nums[0].phoneNumber);
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch numbers:", e);
      }
    }
    fetchNumbers();
  }, [API_BASE_URL, user?.id]);


  const handleViewChange = (view: string) => {
    setCurrentView(view as 'calls' | 'messages' | 'campaigns');
    if (view === 'calls') setInitialConvId(null);
  };

  const handleGoToMessage = (number: string | null) => {
    if (!number) return;
    setInitialConvId(number);
    setCurrentView('messages');
  };

  // State to track if message detail is open on mobile
  const [isMessageDetailOpen, setIsMessageDetailOpen] = useState(false);

  // --- Campaign & Dialer Logic ---

  const fetchNextLead = async (campaignId: string, excludeId?: string, leadToArchive?: any) => {
    setIsLoading(true);
    try {
      const leadToPush = leadToArchive || currentLead;

      // Calculate new history to use for exclusion logic
      let updatedHistory = [...leadHistory];
      if (leadToPush) {
        updatedHistory.push(leadToPush);
        setLeadHistory(prev => [...prev, leadToPush]);
      }

      setCurrentLead(null);

      // Collect ALL IDs to exclude: history + current explicit exclude
      const excludeIds = updatedHistory.map(l => l.id);
      if (excludeId) excludeIds.push(excludeId);

      // Unique IDs
      const uniqueExcludes = Array.from(new Set(excludeIds));
      const excludeParam = uniqueExcludes.length > 0 ? uniqueExcludes.join(',') : '';

      const url = excludeParam
        ? `${API_BASE_URL}/campaigns/${campaignId}/next-lead?exclude_id=${excludeParam}`
        : `${API_BASE_URL}/campaigns/${campaignId}/next-lead`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch next lead");

      const lead = await res.json();
      if (lead) {
        // Double check against exclusions (though backend does it)
        if (uniqueExcludes.includes(lead.id)) {
          alert("Warning: Backend returned a visited lead. Retrying logic might be needed.");
        }

        setCurrentLead(lead);
        if (lead.phone) setDialedNumber(lead.phone);
        setSelectedStatuses([]);
      } else {
        setCurrentLead(null);
        alert("No more pending leads in this campaign.");
        setDialerMode(false);
      }

    } catch (err) {
      console.error("Error fetching lead:", err);
      alert("Error fetching next lead. Please check connection.");
    } finally {
      setIsLoading(false);
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

      await fetch(`${API_BASE_URL}/leads/${currentLead.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusString, notes })
      });

      // Auto-fetch next lead (User request: Advance automatically)
      // Auto-fetch next lead (User request: Advance automatically)
      // Auto-fetch next lead (User request: Advance automatically)
      if (activeCampaignId) {
        // Create the updated object explicitly to save to history
        const leadToArchive = { ...currentLead, status: statusString, notes: notes || currentLead.notes };

        // Pass currentLead.id to ensure we don't fetch the same one
        fetchNextLead(activeCampaignId, currentLead.id, leadToArchive);
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
    if (activeCampaignId) {
      // Pass currentLead.id to ensure we don't fetch the same one, even if status update lags
      fetchNextLead(activeCampaignId, currentLead?.id);
    } else {
      alert("Error: No Active Campaign ID found. Please refresh.");
      console.error("handleNextLead called but activeCampaignId is null");
    }
  };

  const handleSkipLead = () => {
    // Skip implies same action as next for now, but explicitly skipping
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
    } catch (_e) { console.error("Error refreshing back lead"); }
  };

  // Fetch token & History
  useEffect(() => {
    if (!user) return; // Wait for user

    const init = async () => {
      try {
        setIsLoading(true);
        // 1. Get Token (Pass identity for unique session)
        // 1. Get Token (Pass identity for unique session)
        // Use raw email as identity to match Backend/Supabase casing exactly
        const identity = user.email || `user_${user.id}`; // Removed .toLowerCase()
        const tokenRes = await fetch(`${API_BASE_URL}/token?identity=${encodeURIComponent(identity)}`);

        if (!tokenRes.ok) throw new Error('Failed to fetch token');
        const tokenData = await tokenRes.json();
        setToken(tokenData.token);
        setTokenFetchedAt(Date.now()); // Set timestamp
        setIdentity(tokenData.identity);

        // 2. Get History (Filtered by User)
        // Pass userId and role if available
        let historyUrl = `${API_BASE_URL}/history/calls?userId=${user.id}`;
        if (userRole) historyUrl += `&role=${userRole}`;

        const historyRes = await fetch(historyUrl);
        if (!historyRes.ok) throw new Error('Failed to fetch history');
        const historyData = await historyRes.json();
        if (Array.isArray(historyData)) {
          setCalls(historyData);
        } else {
          console.error('Expected array of calls, got:', historyData);
          setCalls([]);
        }
      } catch (error: any) {
        console.error('Error initializing:', error);
        setError(error.message || 'Failed to connect to server');
      } finally {
        setIsLoading(false);
      }
    };
    init();

    // 3. Realtime Subscription (Calls)
    const channelCalls = supabase
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

    // 4. Realtime Subscription (Messages)
    const channelMessages = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new;
        setMessages((prev) => [...prev, newMsg]);
      })
      .subscribe();

    // Fetch Messages Initial
    const fetchMessages = async () => {
      try {
        let url = `${API_BASE_URL}/history/messages`;
        const params = new URLSearchParams();
        if (user?.id) params.append('userId', user.id);
        if (userRole) params.append('role', userRole);

        if (params.toString()) url += `?${params.toString()}`;

        const response = await fetch(url);
        const data = await response.json();
        if (Array.isArray(data)) {
          setMessages(data);
        } else {
          console.error('Expected array of messages, got:', data);
          setMessages([]);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };
    if (user) fetchMessages();

    return () => {
      supabase.removeChannel(channelCalls);
      supabase.removeChannel(channelMessages);
    };
  }, [user, userRole]);

  // New State for Robustness
  const [isDeviceReady, setIsDeviceReady] = useState(false);

  // Initialize Twilio Device
  useEffect(() => {
    if (!token) return;

    console.log("Initializing Twilio Device (v1.6)...");
    // OPTIMIZATION: Prioritize Ashburn (US East) > Rochester > Sao Paulo, and Opus codec
    const deviceOptions = {
      logLevel: 1,
      codecPreferences: ['opus', 'pcmu'],
      edge: ['ashburn', 'rochester', 'sao-paulo']
    } as any; // Type casting for edge support if types are old

    console.log("Initializing Twilio Device (v1.6 Optimized)...", deviceOptions);
    const newDevice = new Device(token, deviceOptions);

    newDevice.on('registered', () => {
      console.log('Twilio Device Registered via edge:', (newDevice as any).edge);
      setCallStatus('Disponible');
      setIsDeviceReady(true);
    });

    newDevice.on('error', (error: any) => {
      console.error('Twilio Device Error:', error);

      // Silent Reconnect for Network Errors (1000 - 1006, 31000s)
      const isNetworkError = [31000, 31005, 31009, 1000, 1006].includes(error.code);

      if (isNetworkError) {
        console.warn("Network breakdown detected. Attempting silent reconnect...");
        setCallStatus('Reconectando...');
        // Small delay then re-register
        setTimeout(() => {
          if (newDevice && (newDevice.state as any) === 'Unregistered') {
            newDevice.register();
          }
        }, 2000);
        return;
      }

      let msg = error.message;
      if (error.code === 31009 || error.code === 31000 || error.code === 31005) {
        msg = "Red inestable/bloqueada. Reintentando...";
      }

      setCallStatus('Error: ' + msg);
      setIsDeviceReady(false);
    });

    newDevice.on('incoming', (call) => {
      console.log("Incoming call from:", call.parameters.From);
      stopRingback(); // Ensure no outgoing ringback is playing

      setCallStatus('Llamada Entrante...');
      setActiveCall(call);

      // Play Incoming Ringtone? (Optional, maybe later)

      call.on('accept', () => {
        setCallStatus('En Llamada');
        setActiveCall(call);
      });

      call.on('disconnect', () => {
        setActiveCall(null);
        setCallStatus('Disponible');
      });

      call.on('cancel', () => {
        setActiveCall(null);
        setCallStatus('Disponible');
      });

      call.on('error', (e: any) => {
        console.error("Incoming Call Error:", e);
        setCallStatus('Error: ' + e.message);
      });
    });

    newDevice.on('tokenWillExpire', async () => {
      console.log('Token expiring soon, refreshing...');
      try {
        const idParam = user?.email ? `?identity=${encodeURIComponent(user.email)}` : '';
        const res = await fetch(`${API_BASE_URL}/token${idParam}`);
        if (res.ok) {
          const data = await res.json();
          newDevice.updateToken(data.token);
          console.log('Token refreshed successfully (internal)');
        }
      } catch (e) {
        console.error('Failed to refresh token:', e);
      }
    });

    newDevice.register();
    setDevice(newDevice);

    return () => {
      console.log("Destroying Twilio Device...");
      setIsDeviceReady(false);
      newDevice.destroy();
      setDevice(null); // Ensure state is cleared to avoid using destroyed device
    };
  }, [token, user?.email]); // DEPEND ONLY ON TOKEN


  // --- CONNECTION HEARTBEAT & AUTO-RECONNECT ---
  // Fixes "Zombie Tab" issue where Chrome sleeps the socket
  useEffect(() => {
    if (!device) return;

    // 1. Polling Heartbeat (Check connection every 5s)
    const heartbeatInterval = setInterval(() => {
      const state = (device as any)?.state; // Twilio Device State
      if (state === 'Unregistered' || state === 'Destroyed' || !device.token) {
        console.warn('⚠️ Heartbeat: Device disconnected. Updating UI.');
        setCallStatus('Desconectado (Recargar)');
        setIsDeviceReady(false);
      } else if (state === 'Registered') {
        const currentMs = Date.now();
        // Debounce: Only announce restored if it has been stable for >2s or if we were definitely offline
        if (!isDeviceReady) {
          console.log("🟢 Connection Restored!");
          setIsDeviceReady(true);
          setCallStatus('Disponible');
          // AUDIO
          try {
            const u = new SpeechSynthesisUtterance("Sistema conectado");
            u.lang = 'es-ES';
            window.speechSynthesis.speak(u);
          } catch (e) { }
        }
      }
    }, 10000); // Relaxed to 10s to avoid race conditions

    // 2. Window Focus Re-check & Token Refresh
    const handleFocus = async () => {
      console.log("👀 Window Focused - Checking Connection & Token...");

      // A. Proactive Token Refresh (If > 45 mins old)
      if (tokenFetchedAt > 0) {
        const tokenAgeMinutes = (Date.now() - tokenFetchedAt) / 1000 / 60;
        console.log(`Token Age: ${tokenAgeMinutes.toFixed(1)} mins`);

        if (tokenAgeMinutes > 45) {
          console.log("⚠️ Token is stale (>45 mins). Refreshing IMMEDIATELY...");
          try {
            // Re-fetch token logic
            const idParam = user?.email ? `?identity=${encodeURIComponent(user.email)}` : '';
            const res = await fetch(`${API_BASE_URL}/token${idParam}`);
            if (res.ok) {
              const data = await res.json();
              if (device) {
                device.updateToken(data.token);
                console.log('✅ Token refreshed proactively on focus.');
              }
              setToken(data.token);
              setTokenFetchedAt(Date.now());
            }
          } catch (e) {
            console.error("Failed to refresh token on focus:", e);
          }
        }
      }

      const state = (device as any)?.state;
      // ONLY Re-register if TRULY disconnected. 
      // Do NOT interrupt if state is "Incoming", "Busy", or transitioning.
      if (state === 'Unregistered' || state === 'Destroyed') {
        console.log("⚠️ Found dead connection on focus. Re-registering...");
        setCallStatus('Reconectando...');
        setIsDeviceReady(false);
        // If token was just refreshed above, this register will use the old device instance 
        // but arguably updateToken should have handled it. If destroyed, we might need a full re-init 
        // but 'token' state change triggers re-init in that other useEffect.
        if (device.state !== 'destroyed') device.register();
      } else {
        console.log(`✅ Connection OK on focus (State: ${state})`);
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [device, isDeviceReady, tokenFetchedAt, user?.email]); // Added dependencies

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
    if (!device) {
      alert("El teléfono se está iniciando... Espere 3 segundos.");
      return;
    }
    if (!isDeviceReady) {
      alert("Teléfono conectando... Espere a que esté 'Disponible'.");
      return;
    }

    // MIC CHECK
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert("Error de Micrófono: Por favor permita el acceso en la configuración del navegador.");
      return;
    }

    setDialedNumber(number); // Store for display
    try {
      setCallStatus('Llamando a ' + number + '...');
      // IMPORTANT: Explicitly cast to any to allow custom params
      const params: any = { To: number };

      // Use appCallerId to avoid potential Twilio param conflicts
      if (callerId) params.appCallerId = callerId;

      // Pass User ID for isolation tracking
      if (user?.id) {
        params.appUserId = user.id;
        console.log("Adding appUserId to call params:", user.id);
      }

      console.log("[Client] Connecting with params:", params);

      if (device.state === 'destroyed') {
        throw new Error("Dispositivo destruido. Por favor recargue la página.");
      }


      // PRE-FLIGHT CHECK: Token Age
      // If token is > 30 mins old, force refresh BEFORE dialing.
      if (tokenFetchedAt > 0) {
        const tokenAgeMinutes = (Date.now() - tokenFetchedAt) / 1000 / 60;
        console.log(`[Pre-Flight] Token Age: ${tokenAgeMinutes.toFixed(1)} mins`);

        if (tokenAgeMinutes > 30) {
          console.log("⚠️ Token stale (>30m). Forcing refresh before call...");
          setCallStatus('Renovando Token de Seguridad...');
          try {
            const idParam = user?.email ? `?identity=${encodeURIComponent(user.email)}` : '';
            const res = await fetch(`${API_BASE_URL}/token${idParam}`);
            if (!res.ok) throw new Error("Token refresh failed");
            const data = await res.json();

            // Update Device
            device.updateToken(data.token);
            setToken(data.token);
            setTokenFetchedAt(Date.now());
            console.log("✅ Token Security Refreshed. Proceeding to dial...");
            // Small delay to let socket reconnect if needed
            await new Promise(r => setTimeout(r, 500));
          } catch (e) {
            console.error("Pre-flight token refresh failed", e);
            alert("Falló la renovación de seguridad. Por favor recargue la página.");
            return;
          }
        }
      }

      // START RINGBACK TONE
      startRingback();

      let call;
      try {
        call = await device.connect({ params });
      } catch (connErr: any) {
        console.error("Device Connect Error:", connErr);
        stopRingback();
        if (connErr.code === 31005 || connErr.code === 31000 || connErr.code === 31009) {
          alert("Error de Conexión (31005): Se perdió conexión con el servidor.\n\nHaga clic en 'Reiniciar Conexión' o recargue la página.");
          setCallStatus("Conexión Perdida");
        }
        throw connErr;
      }

      setCallStatus('Marcando...'); // Immediate UI update
      // Set active call immediately to show UI controls (including Keypad)
      setActiveCall(call);

      call.on('accept', () => {
        stopRingback(); // STOP RINGBACK
        setCallStatus('En Llamada');
        setActiveCall(call); // Re-set to ensure state persistence
      });

      call.on('disconnect', () => {
        stopRingback(); // STOP RINGBACK
        setCallStatus('Disponible');
        setActiveCall(null);
        setIsMuted(false);
        setDialedNumber('');
        setIsKeypadOpen(false); // Reset keypad state
      });

      call.on('cancel', () => {
        stopRingback(); // STOP RINGBACK
        setCallStatus('Disponible');
        setActiveCall(null);
        setDialedNumber('');
      });

      call.on('error', (error: any) => {
        stopRingback(); // STOP RINGBACK
        console.error('Call Error:', error);
        setCallStatus(`Error: ${error.message || 'Unknown Call Error'}`);
        setActiveCall(null);
        setDialedNumber('');
      });

    } catch (error: any) {
      stopRingback(); // STOP RINGBACK
      console.error('Error making call:', error);
      if (error.name === 'NotAllowedError' || error.message?.includes('Permission denied') || error.code === 31208) {
        setCallStatus('Acceso Micrófono Denegado');
        alert("Por favor permita el acceso al micrófono para realizar llamadas.");
      } else {
        const errMsg = error.message || 'Unknown Connection Error';
        setCallStatus(`Error: ${errMsg}`);
        alert(`Llamada fallida: ${errMsg}`); // Also alert for visibility
      }
    }
  };

  const handleHangup = () => {
    stopRingback(); // STOP RINGBACK (Manual Hangup)
    console.log("Hangup requested. Active call:", activeCall);

    // 1. Try hanging up the known active call
    if (activeCall) {
      if (activeCall.status() === 'open' || activeCall.status() === 'ringing') {
        activeCall.disconnect(); // Outbound
      } else {
        activeCall.reject(); // Inbound if ringing? Twilio logic assumes disconnect works for accepted calls
      }
    }

    // 2. NUCLEAR OPTION: Terminate ALL connections on the device
    // This fixes "Ghost Calls" and "Incoming Call" stuck UI
    if (device) {
      console.log("Executing Global Disconnect on Device...");
      device.disconnectAll();

      // Twilio SDK 2.x specific: Try to reject pending invitations
      // Note: device.connections is an array of Connections
      /* @ts-ignore */
      const conns = (device as any).connections;
      if (conns) {
        /* @ts-ignore */
        conns.forEach((conn: any) => {
          if (conn.status() === 'pending' || conn.status() === 'ringing') {
            console.log("Rejecting pending connection:", conn);
            conn.reject();
          }
        });
      }
    }

    setCallStatus('Disponible');
    setActiveCall(null);
    setDialedNumber('');
    setIsMuted(false);
    setIsKeypadOpen(false);
  };
  const toggleMute = () => {
    if (activeCall) {
      const newMuted = !isMuted;
      activeCall.mute(newMuted);
      setIsMuted(newMuted);
      activeCall.mute(newMuted);
      setIsMuted(newMuted);
    }
  };

  // Heartbeat Logic (Every 60s)
  useEffect(() => {
    if (!user?.id) return; // Only if logged in

    const sendHeartbeat = async () => {
      try {
        await fetch(`${API_BASE_URL}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });
        // console.log("Heartbeat sent");
      } catch (e) {
        console.error("Heartbeat failed", e);
      }
    };

    // Send immediately on mount/login
    sendHeartbeat();

    // Loop
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Handle incoming calls manually if needed (Twilio does this via device.on('incoming'))st [activeMobileTab, setActiveMobileTab] = useState<'calls' | 'contacts' | 'messages' | 'voicemail' | 'details'>('calls');
  const [activeMobileTab, setActiveMobileTab] = useState<'calls' | 'contacts' | 'messages' | 'voicemail' | 'details'>('calls');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Auto-switch to Details on selection (mobile)
  useEffect(() => {
    if (selectedCall && window.innerWidth < 1024) {
      // Ideally we'd have a 'details' sub-view, but for now let's keep it simple
      // If we select a call, we are still in 'calls' tab but showing details overlay
    }
  }, [selectedCall]);

  const toggleDialer = () => {
    setDialerMode(!dialerMode);
  };

  // Refactored Render Function for Logic Clarity
  const renderCallPanel = () => {
    // 1. PRIORITY: Incoming Call
    // Debug: Check if 'Incom' exists or starts with 'Inc'
    const isIncoming = (activeCall && (activeCall.status() === 'ringing' || activeCall.status() === 'pending')) ||
      (callStatus && (
        callStatus.toLowerCase().includes('entrante') ||
        callStatus.toLowerCase().includes('llamada') ||
        callStatus.startsWith('Llamada')
      ));

    if (isIncoming) {
      return (
        <div className="w-full flex flex-col items-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="text-center mb-2">
            <div className="animate-bounce inline-flex p-3 rounded-full bg-blue-100 text-blue-600 mb-2">
              <Phone className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">LLAMADA ENTRANTE</h3>
            <p className="text-xl font-mono text-gray-700 mt-1 font-semibold">
              {activeCall?.parameters?.From || 'Llamada Entrante'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full px-4">
            <button
              onClick={() => {
                console.log("Answering from v4.0 UI");
                if (activeCall) {
                  activeCall.accept();
                  setCallStatus('En Llamada');
                } else {
                  // Rescue
                  const conn = (device as any)?.connections?.[0];
                  if (conn) {
                    conn.accept();
                    setActiveCall(conn);
                    setCallStatus('En Llamada');
                  } else {
                    alert("No Connection Found in Device Object");
                  }
                }
              }}
              className="flex flex-col items-center justify-center h-20 rounded-2xl bg-green-500 text-white shadow-lg hover:bg-green-600 transition-all hover:-translate-y-1 active:scale-95"
            >
              <Phone className="w-8 h-8 mb-1" />
              <span className="text-xs font-bold uppercase tracking-wider">Contestar</span>
            </button>

            <button
              onClick={() => {
                if (activeCall) activeCall.reject();
                else device?.disconnectAll();
                setActiveCall(null);
                setCallStatus('Disponible');
              }}
              className="flex flex-col items-center justify-center h-20 rounded-2xl bg-red-500 text-white shadow-lg hover:bg-red-600 transition-all hover:-translate-y-1 active:scale-95"
            >
              <PhoneOff className="w-8 h-8 mb-1" />
              <span className="text-xs font-bold uppercase tracking-wider">Rechazar</span>
            </button>
          </div>
        </div>
      );
    }

    // 2. FAILSAFE: If no activeCall but text says Incoming, SHOW ABOVE UI.
    // (Already covered by OR clause above, but let's be double sure to avoid fallthrough)

    // 3. Active Call / Busy State
    if (activeCall || (callStatus !== 'Disponible' && !callStatus.includes('Error'))) {
      return (
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
              <div className="grid grid-cols-3 gap-3 w-4 h-4 items-center justify-center ml-2 mt-1">
                {[...Array(9)].map((_, i) => <div key={i} className={`w-0.5 h-0.5 rounded-full ${isKeypadOpen ? 'bg-white' : 'bg-gray-400'}`} />)}
              </div>
            </button>
            <button onClick={handleHangup} className="col-span-1 flex flex-col items-center justify-center h-14 rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-md transition-all active:scale-95">
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>

          {isKeypadOpen && (
            <div className="grid grid-cols-3 gap-2 w-full pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => activeCall?.sendDigits(digit)}
                  className="h-10 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-lg font-bold text-gray-700 transition-colors"
                >
                  {digit}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // 4. Default: Dialer
    return (
      <div className="w-full">
        <div className="w-full space-y-3">
          <div className="relative">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Calling From</label>
            <select
              className="w-full p-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-cyan-500"
              value={selectedCallerId}
              onChange={(e) => setSelectedCallerId(e.target.value)}
            >
              {availableNumbers.length > 0 ? (
                availableNumbers.map(num => (
                  <option key={num.phoneNumber} value={num.phoneNumber}>
                    {formatCallerID(num.phoneNumber)}
                  </option>
                ))
              ) : (
                <option value="">Loading numbers...</option>
              )}
              <option value="client:agent">Browser (Testing)</option>
            </select>
          </div>

          <button
            onClick={() => handleCall(currentLead.phone, selectedCallerId)}
            className="w-full py-4 bg-green-500 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-green-600 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center active:scale-95 transform"
          >
            <Phone className="w-5 h-5 mr-2" />
            Call Lead
          </button>

          <button
            onClick={() => handleCall('888888', selectedCallerId)}
            className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center"
            title="Verify microphone and speakers"
          >
            <Activity className="w-3 h-3 mr-1" />
            Audio Test
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden relative font-sans">
      {/* --- GOD MODE TOOLBAR (FIXED TOP) --- */}
      {/* --- GOD MODE TOOLBAR (FIXED TOP) - HIDDEN BY DEFAULT --- */}
      {false && (
        <div className="fixed top-0 left-0 right-0 h-8 bg-red-900 text-white z-[9999] flex items-center justify-between px-4 shadow-xl">
          <span className="text-xs font-mono font-bold">
            VICIDIAL v5.7 (Stable) | ID: {identity}
          </span>
          <div className="flex gap-2">
            {/* HEARTBEAT INDICATOR */}
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${isDeviceReady ? 'bg-green-800' : 'bg-red-800'} border ${isDeviceReady ? 'border-green-600' : 'border-red-600'}`}>
              <div className={`w-2 h-2 rounded-full ${isDeviceReady ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-mono font-bold">{isDeviceReady ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <span className="text-[10px] font-mono opacity-80 self-center mr-2">Estado: {callStatus} | Disp: {device ? 'OK' : 'NO'}</span>

            {/* NEW: Switch Identity Button */}
            <button
              onClick={async () => {
                const newIdentity = identity === 'agent' ? (user?.email || 'user') : 'agent';
                if (confirm(`Switch identity to '${newIdentity}'? This handles backend fallback.`)) {
                  try {
                    if (device) device.destroy();
                    setDevice(null);
                    setIsDeviceReady(false);
                    const res = await fetch(`${API_BASE_URL}/token?identity=${newIdentity}`);
                    const data = await res.json();
                    setToken(data.token); // Will trigger useEffect to re-init device
                    setIdentity(data.identity);
                    alert(`Switched to ${newIdentity}. Wait for Device OK.`);
                  } catch (e) { alert("Switch failed: " + e); }
                }
              }}
              className="bg-purple-700 hover:bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded font-bold border border-purple-400"
            >
              AS: {identity === 'agent' ? 'USER' : 'AGENT'}
            </button>

            <button
              onClick={() => {
                if (device) {
                  const conns = (device as any).connections;
                  if (conns && conns.length > 0) {
                    const active = conns[0];
                    active.accept();
                    setActiveCall(active);
                    setCallStatus("In Call (Forced)");
                  } else {
                    alert(`No connections for ID: ${identity}`);
                  }
                }
              }}
              className="bg-green-600 hover:bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-bold border border-green-400"
            >
              FORCE ANSWER
            </button>
            <button
              onClick={() => location.reload()}
              className="bg-gray-600 hover:bg-gray-500 text-white text-[10px] px-2 py-0.5 rounded font-bold"
            >
              RELOAD
            </button>
          </div>
        </div>
      )}
      {/* ------------------------------------ */}
      {/* 1. NAVIGATION RAIL (Google Voice Style) */}
      <div className={`${isSidebarExpanded ? 'w-64' : 'w-20'} flex flex-col items-center py-4 bg-gray-50 border-r border-gray-200 z-20 shrink-0 hidden md:flex transition-all duration-300 ease-in-out`}>
        <button
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="p-3 mb-6 hover:bg-gray-200 rounded-full transition-colors text-gray-600 self-center"
        >
          <Menu className="w-6 h-6" />
        </button>

        <nav className="flex-1 flex flex-col gap-2 w-full px-2 items-center">
          <NavIcon
            icon={<Phone className="w-6 h-6" />}
            label="Llamadas"
            active={currentView === 'calls' || currentView === 'history'}
            onClick={() => handleViewChange('calls')}
            expanded={isSidebarExpanded}
          />
          <NavIcon
            icon={<MessageSquare className="w-6 h-6" />}
            label="Mensajes"
            active={currentView === 'messages'}
            onClick={() => handleViewChange('messages')}
            expanded={isSidebarExpanded}
          />
          {userRole === 'admin' && (
            <NavIcon
              icon={<BarChart3 className="w-6 h-6" />}
              label="Reportes"
              active={currentView === 'reports'}
              onClick={() => handleViewChange('reports')}
              expanded={isSidebarExpanded}
            />
          )}
          {userRole === 'admin' && (
            <NavIcon
              icon={<Shield className="w-6 h-6" />}
              label="Admin Panel"
              active={false}
              onClick={() => window.location.href = '/admin'}
              expanded={isSidebarExpanded}
            />
          )}
        </nav>

        {/* User & Status Dot */}
        <div className={`flex flex-col gap-4 pb-4 items-center ${isSidebarExpanded ? 'px-4 w-full' : ''}`}>

          {/* Logout Button */}
          <button
            onClick={() => {
              if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
                // Implement actual logout logic here (e.g., signOut() or clear cookies)
                window.location.href = '/login';
              }
            }}
            className={`flex items-center justify-center rounded-lg transition-colors text-red-400 hover:text-red-500 hover:bg-red-50 ${isSidebarExpanded ? 'w-full py-2 mb-2' : 'w-10 h-10 mb-2'}`}
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5" />
            {isSidebarExpanded && <span className="ml-2 text-sm font-bold">Cerrar Sesión</span>}
          </button>

          <div className="relative group cursor-pointer flex items-center" title={isDeviceReady ? "Online" : "Disconnected"}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold transition-all shadow-sm shrink-0 ${isDeviceReady ? 'bg-purple-600' : 'bg-gray-400'}`}>
              {user?.email?.[0].toUpperCase() || 'G'}
            </div>
            {isSidebarExpanded && (
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-bold text-gray-700 truncate">{user?.email || 'Invitado'}</p>
                <p className="text-xs text-green-600 flex items-center mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span> En Línea
                </p>
                {/* MANUAL RESET BUTTON */}
                <button
                  onClick={() => {
                    setCallStatus("Reiniciando...");
                    if (device) device.disconnectAll();
                    // Trigger a re-fetch of token effectively by reloading or clearing device
                    window.location.reload();
                  }}
                  className="text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded border border-gray-300 transition-colors"
                >
                  Reiniciar Conexión
                </button>
              </div>
            )}
            {!isSidebarExpanded && (
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${isDeviceReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
            )}
          </div>
        </div>
      </div>

      {/* 2. SECONDARY COLUMN (List View & Search) */}
      {/* 2. SECONDARY COLUMN (List View & Search) */}
      {/* Hide on mobile if showing details or dialer/active call */}
      <div className={`w-full md:w-96 flex flex-col bg-white border-r border-gray-200 shrink-0 relative
          ${(activeCall || dialerMode || (isMobile && activeMobileTab === 'details')) ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Search Header */}
        <div className="h-20 flex items-center px-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 flex items-center bg-[#f1f3f4] rounded-full px-4 h-12 transition-all focus-within:bg-white focus-within:shadow-md focus-within:ring-1 focus-within:ring-gray-200">
            <Search className="w-5 h-5 text-gray-500 mr-3" />
            <input
              type="text"
              placeholder="Buscar en Gibbor Voice"
              className="bg-transparent border-none outline-none text-gray-700 w-full placeholder-gray-500 font-medium text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative">

          {/* --- A. CALLS LIST --- */}
          {(currentView === 'calls' || currentView === 'history' || currentView === 'contacts') && (
            <div className="pb-20"> {/* Padding for FAB */}
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mr-2"></div>
                  Cargando...
                </div>
              ) : error ? (
                <div className="p-6 text-center text-red-500 bg-red-50 m-4 rounded-lg text-sm">
                  <p className="font-semibold">Error de Conexión</p>
                  <p>{error}</p>
                  <button onClick={() => window.location.reload()} className="mt-2 text-red-700 underline">Reintentar</button>
                </div>
              ) : (
                calls.map((call, index) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    key={call.id}
                    onClick={() => {
                      setSelectedCall(call);
                      setActiveMobileTab('details');
                    }}
                    className={`p-4 flex items-center cursor-pointer transition-colors border-l-4 hover:bg-gray-50 ${selectedCall?.id === call.id
                      ? 'bg-blue-50/50 border-blue-600'
                      : 'border-transparent'
                      }`}
                  >
                    {/* Modern Avatar */}
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 mr-4 shadow-sm ${getAvatarColor(call.direction === 'inbound' ? (call.from || '#') : (call.to || '#'))}`}
                    >
                      {call.direction === 'inbound' ?
                        (call.from?.[1]?.toUpperCase() || '#') :
                        (call.to?.[1]?.toUpperCase() || '#')}
                    </motion.div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h3 className={`text-sm font-bold truncate ${selectedCall?.id === call.id ? 'text-gray-900' : 'text-gray-800'}`}>
                          {call.direction === 'outbound' ? formatCallerID(call.to) : formatCallerID(call.from)}
                        </h3>
                        <span className={`text-[10px] shrink-0 ml-2 font-medium ${selectedCall?.id === call.id ? 'text-blue-600' : 'text-gray-400'}`}>
                          {call.created_at && format(new Date(call.created_at), 'MMM d')}
                        </span>
                      </div>
                      <div className="flex items-center text-xs text-gray-500">
                        {call.direction === 'outbound' ? (
                          <ArrowUpRight className="w-3 h-3 mr-1.5 text-gray-400" />
                        ) : (
                          <ArrowDownLeft className="w-3 h-3 mr-1.5 text-purple-500" />
                        )}
                        <span className="truncate">{call.direction === 'inbound' ? 'Entrante' : 'Saliente'} • {call.duration || 0}s</span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* --- B. MESSAGES LIST --- */}
          {currentView === 'messages' && (
            <div className="pb-20">
              {conversations.map((conv, index) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={conv.id}
                  onClick={() => {
                    setInitialConvId(conv.id);
                    setActiveMobileTab('details');
                  }}
                  className={`p-4 flex items-start cursor-pointer transition-colors border-l-4 hover:bg-gray-50 ${initialConvId === conv.id
                    ? 'bg-blue-50/50 border-blue-600'
                    : 'border-transparent'
                    }`}
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 mr-4 shadow-sm ${getAvatarColor(conv.id)}`}
                  >
                    {conv.id.replace(/\D/g, '')[0] || '#'}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h3 className={`text-sm font-bold truncate ${initialConvId === conv.id ? 'text-gray-900' : 'text-gray-800'}`}>
                        {formatCallerID(conv.id)}
                      </h3>
                      <span className={`text-[10px] shrink-0 ml-2 font-medium ${initialConvId === conv.id ? 'text-blue-600' : 'text-gray-400'}`}>
                        {new Date(conv.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-xs truncate ${initialConvId === conv.id ? 'text-gray-700' : 'text-gray-500'}`}>
                      {conv.lastMessage.direction === 'outbound' ? 'Tú: ' : ''}
                      {conv.lastMessage.media_url ? '📷 Imagen' : conv.lastMessage.body}
                    </p>
                  </div>
                </motion.div>
              ))}

              {conversations.length === 0 && (
                <div className="p-10 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-500 text-sm">No hay mensajes aún</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Top Mobile Header (Google Voice Style) */}
      <div className="2xl:hidden fixed top-0 left-0 right-0 h-16 bg-gray-900 text-white flex items-center px-4 z-50 shadow-md">
        <button
          className="p-2 mr-2 text-gray-300"
          onClick={() => setIsSidebarOpen(true)}
        >
          <MoreVertical className="w-6 h-6 rotate-90" /> {/* Hamburger Approximation */}
        </button>

        <div className="flex-1 bg-gray-800 rounded-full h-10 flex items-center px-4 mx-2">
          <Search className="w-4 h-4 text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Buscar en Voice"
            className="bg-transparent border-none focus:outline-none text-sm text-white w-full placeholder-gray-400"
          />
        </div>

        <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
          W
        </div>
      </div>

      {/* Main Content Area adjustments for Mobile Header padding */}
      <div className="flex-1 flex flex-col md:flex-row pt-16 lg:pt-0 h-full">

        {/* Mobile Bottom Nav (Google Voice Style) - Hidden during Call/Dialpad/MessageDetail */}
        <div className={`2xl:hidden fixed bottom-0 left-0 right-0 h-20 bg-[#1e1e1e] border-t border-gray-800 z-50 flex justify-around items-center pb-2 text-gray-400 ${(dialerMode || activeCall || isMessageDetailOpen) ? 'hidden' : ''}`}>
          <button
            onClick={() => { setActiveMobileTab('calls'); handleViewChange('calls'); }}
            className={`flex flex-col items-center justify-center w-full h-full ${activeMobileTab === 'calls' ? 'text-blue-400' : ''}`}
          >
            <div className={`rounded-full px-5 py-1 mb-1 ${activeMobileTab === 'calls' ? 'bg-blue-900/30' : ''}`}>
              <Phone className={`w-6 h-6 ${activeMobileTab === 'calls' ? 'fill-current' : ''}`} />
            </div>
            <span className="text-xs font-medium">Llamadas</span>
          </button>

          <button
            onClick={() => { setActiveMobileTab('contacts'); }} // Placeholder
            className={`flex flex-col items-center justify-center w-full h-full ${activeMobileTab === 'contacts' ? 'text-blue-400' : ''}`}
          >
            <div className={`rounded-full px-5 py-1 mb-1 ${activeMobileTab === 'contacts' ? 'bg-blue-900/30' : ''}`}>
              <div className="w-6 h-6 border-2 border-current rounded-full flex items-center justify-center text-[10px] font-bold">C</div>
            </div>
            <span className="text-xs font-medium">Contactos</span>
          </button>

          <button
            onClick={() => { setActiveMobileTab('messages'); handleViewChange('messages'); }}
            className={`flex flex-col items-center justify-center w-full h-full ${activeMobileTab === 'messages' ? 'text-blue-400' : ''}`}
          >
            <div className={`rounded-full px-5 py-1 mb-1 ${activeMobileTab === 'messages' ? 'bg-blue-900/30' : ''}`}>
              <MessageSquare className={`w-6 h-6 ${activeMobileTab === 'messages' ? 'fill-current' : ''}`} />
            </div>
            <span className="text-xs font-medium">Mensajes</span>
          </button>

          <button
            onClick={() => { setActiveMobileTab('voicemail'); }} // Placeholder
            className={`flex flex-col items-center justify-center w-full h-full ${activeMobileTab === 'voicemail' ? 'text-blue-400' : ''}`}
          >
            <div className={`rounded-full px-5 py-1 mb-1 ${activeMobileTab === 'voicemail' ? 'bg-blue-900/30' : ''}`}>
              <div className="w-6 h-6 border-b-2 border-l-2 border-current rotate-45 transform mt-[-4px]"></div>
            </div>
            <span className="text-xs font-medium">Buzón de voz</span>
          </button>
        </div>

        {/* Floating Action Button (FAB) */}
        {/* Floating Action Button (FAB) */}
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setDialerMode(true)}
          className="2xl:hidden fixed bottom-24 right-4 w-16 h-16 bg-cyan-600 rounded-2xl shadow-xl flex items-center justify-center text-white z-50 hover:bg-cyan-500 transition-colors"
        >
          <Plus className="w-8 h-8" />
        </motion.button>

        {/* Existing Content Rendering Logic (Modified to fit new container) */}
        {(currentView === 'calls' || currentView === 'history' || currentView === 'contacts') && !dialerMode && (
          <>
            {/* 2. Call List (Left) - Adjusted for Mobile */}
            {/* 2. Call List (Removed - Moved to Secondary Column) */}


            {/* 3. Center Panel (Details) */}
            <div
              style={{ minWidth: 0, flexGrow: 1 }}
              className={`
             flex-1 flex-col bg-white border-r border-gray-200 min-w-0
             ${activeMobileTab === 'details' ? 'flex' : 'hidden md:flex'}
          `}>
              {/* Note: Added flex above to ensure it displays correctly when active */}
              {selectedCall ? (
                <div className="flex-1 flex flex-col mb-16 lg:mb-0">
                  {/* Header */}
                  <header className="h-16 border-b border-gray-200 flex justify-between items-center px-6">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedCall(null);
                          // If we were in details, go back to calls tab effectively
                          setActiveMobileTab('calls');
                        }}
                        className="lg:hidden p-2 -ml-2 text-gray-500"
                      >
                        <ArrowDownLeft className="w-5 h-5 rotate-90" /> {/* Back Icon Hack */}
                      </button>
                      <h2 className="text-lg font-medium text-gray-800">
                        {selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from}
                      </h2>
                    </div>
                    <div className="flex space-x-2 relative">
                      <button
                        onClick={() => handleGoToMessage(selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from)}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-cyan-600 transition-colors"
                        title="Mensaje"
                        aria-label="Message"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleCall(selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from, selectedCallerId)}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-green-600 transition-colors"
                        title="Llamar"
                        aria-label="Call"
                      >
                        <Phone className="w-5 h-5" />
                      </button>

                      {/* More Menu */}
                      <button
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                        title="Más opciones"
                        aria-label="More options"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Status Card */}
                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Estado</p>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${selectedCall.status === 'completed' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                          <span className="font-medium text-gray-900 capitalize">{selectedCall.status}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">Duración</p>
                        <span className="font-medium text-gray-900">{selectedCall.duration || 0}s</span>
                      </div>
                    </div>

                    {/* Recording Player */}
                    {selectedCall.recording_url ? (
                      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Mic className="w-5 h-5" />
                          </div>
                          <h3 className="font-medium text-gray-900">Grabación de Llamada</h3>
                        </div>
                        <AudioPlayer src={selectedCall.recording_url} />
                        <div className="mt-4 flex justify-end">
                          <a href={selectedCall.recording_url} download target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium">
                            <Download className="w-4 h-4" /> Descargar
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-8 border border-gray-100 border-dashed text-center text-gray-400">
                        <MicOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No hay grabación disponible para esta llamada.
                      </div>
                    )}

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-gray-100 bg-white">
                        <div className="flex items-center gap-2 text-gray-500 mb-1">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs font-medium uppercase tracking-wide">Hora</span>
                        </div>
                        <p className="font-medium text-gray-900">
                          {selectedCall.created_at ? format(new Date(selectedCall.created_at), 'PP p') : '-'}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl border border-gray-100 bg-white">
                        <div className="flex items-center gap-2 text-gray-500 mb-1">
                          <MapPin className="w-4 h-4" />
                          <span className="text-xs font-medium uppercase tracking-wide">Ubicación</span>
                        </div>
                        <p className="font-medium text-gray-900">
                          {selectedCall.to_city || '-'}, {selectedCall.to_state || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Phone className="w-8 h-8 text-gray-300" />
                  </div>
                  <p>Selecciona una llamada para ver detalles</p>
                </div>
              )}
            </div>

          </>
        )}

        {/* Dynamic Content Views */}
        {currentView === 'messages' && (
          <div style={{ minWidth: 0, flexGrow: 1 }} className="flex flex-1 flex-col bg-white border-r border-gray-200 min-w-0">
            <MessagesPanel
              initialConversationId={initialConvId}
              userId={user?.id}
              userRole={userRole}
              onConversationSelect={(id) => setIsMessageDetailOpen(!!id)}
              hideList={true}
            />
          </div>
        )}

        {currentView === 'campaigns' && (
          <div style={{ minWidth: 0, flexGrow: 1 }} className="flex-1 flex-col bg-white border-r border-gray-200 min-w-0">
            <CampaignManager onStartDialer={handleStartDialer} />
          </div>
        )}

        {currentView === 'reports' && (
          <div style={{ minWidth: 0, flexGrow: 1 }} className="flex-1 flex flex-col bg-white border-r border-gray-200 min-w-0 p-10 items-center justify-center">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
              <BarChart3 className="w-12 h-12 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Panel de Reportes</h2>
            <p className="text-gray-500 text-center max-w-md">
              Las métricas avanzadas y reportes administrativos estarán disponibles pronto en esta sección.
            </p>
          </div>
        )}

        {/* 4. Dialpad (Right) */}
        <div
          style={{ flexShrink: 0 }}
          className={`
              w-full md:w-96 border-l border-gray-200 bg-gray-50 flex-col shrink-0 h-full overflow-hidden
              ${(dialerMode || activeCall) ? 'flex absolute inset-0 z-40 bg-white md:static md:bg-gray-50 md:z-auto' : 'hidden md:flex'}
           `}>

          {/* PROMINENT CONNECTION STATUS BAR */}
          <div className={`w-full py-1 text-center text-[10px] font-bold tracking-wider text-white transition-colors duration-500 shrink-0 ${isDeviceReady ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}>
            {isDeviceReady ? '● SISTEMA EN LÍNEA' : '○ DESCONECTADO - RECONECTANDO...'}
          </div>

          <div className="flex-1 p-2 flex flex-col justify-center max-w-sm mx-auto w-full overflow-y-auto min-h-0">

            {/* Active Call UI or Dialpad */}
            {/* Active Call UI or Dialpad */}
            {/* 1. RECONNECTING / LOADING STATE */}
            {(callStatus === 'Reconnecting...' || callStatus === 'Initializing...') ? (
              <div className="w-full flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-300 py-10">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-gray-200 border-t-cyan-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-cyan-500 animate-pulse" />
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-gray-800">Reconectando Sistema...</h3>
                  <p className="text-sm text-gray-500 mt-1">Sincronizando con la red de voz</p>
                </div>

                {/* MANUAL RELOAD BUTTON (FAILSAFE) */}
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-lg transition-colors border border-gray-300"
                >
                  🔄 Forzar Recarga
                </button>
              </div>
            ) : (activeCall || (callStatus !== 'Disponible' && callStatus !== 'Llamada Entrante...' && !callStatus.includes('Error'))) ? (
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
                  {/* SUPER FAILSAFE V2: Explicit Check */}
                  {(callStatus?.toLowerCase().includes('entrante') || callStatus?.startsWith('Llamada')) && (
                    <button
                      onClick={() => {
                        if (activeCall) activeCall.accept();
                        else {
                          const conn = (device as any)?.connections?.[0];
                          if (conn) conn.accept();
                        }
                        setCallStatus('In Call');
                      }}
                      className="col-span-3 mb-2 bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl animate-pulse shadow-lg flex items-center justify-center gap-2 border-2 border-green-400 z-50 order-first"
                      style={{ minHeight: '60px' }}
                    >
                      <Phone className="w-6 h-6 animate-bounce" /> CONTESTAR LLAMADA ENTRANTE
                    </button>
                  )}

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

                {/* In-Call Keypad */}
                {isKeypadOpen && (
                  <div className="grid grid-cols-3 gap-2 w-full pt-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                      <button
                        key={digit}
                        onClick={() => activeCall?.sendDigits(digit)}
                        className="h-10 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-lg font-bold text-gray-700 transition-colors"
                      >
                        {digit}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-8 text-center flex items-center justify-center gap-2 relative">
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${callStatus === 'Disponible' ? 'bg-green-100 text-green-700' :
                    callStatus.includes('Error') ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${callStatus === 'Disponible' ? 'bg-green-500' :
                      callStatus.includes('Error') ? 'bg-red-500' :
                        'bg-blue-500 animate-pulse'
                      }`} />
                    {callStatus}
                  </div>

                  {/* Close Button for Mobile (Next to Status) */}
                  <button onClick={() => setDialerMode(false)} className="p-1.5 bg-gray-100 rounded-full md:hidden text-gray-500 hover:text-gray-700 hover:bg-gray-200" title="Close Dialpad">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Add Caller ID Selection Here - ALWAYS VISIBLE v5.0 */}
                {/* Add Caller ID Selection Here - ALWAYS VISIBLE v5.0 */}
                {/* Add Caller ID Selection Here - VISIBILITY: COMPACT MODE */}
                <div className="mb-2 space-y-2">
                  {/* BOX 1: Designated Callback Number (Read Only) */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 ml-1">
                      CALLBACK (DEVOLUCIÓN)
                    </label>
                    <div className="w-full bg-gray-50 border border-gray-200 text-gray-800 py-1.5 px-2 rounded text-xs font-mono font-medium flex items-center justify-between">
                      <span>{callbackNumber || 'No configurado'}</span>
                      {callbackNumber && <div className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">ACTIVO</div>}
                    </div>
                  </div>

                  {/* BOX 2: Outbound Line Selector */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 ml-1">
                      LÍNEA DE SALIDA
                    </label>
                    {availableNumbers.length > 0 ? (
                      <select
                        className="w-full bg-white border border-gray-300 text-gray-700 py-1.5 px-2 rounded text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-transparent highlight-none"
                        value={selectedCallerId}
                        onChange={(e) => setSelectedCallerId(e.target.value)}
                        aria-label="Select Caller ID"
                      >
                        {availableNumbers.map(num => (
                          <option key={num.phoneNumber} value={num.phoneNumber}>{num.phoneNumber} {num.friendlyName ? `(${num.friendlyName})` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <select
                          className="w-full bg-gray-100 border border-gray-200 text-gray-400 py-1.5 px-2 rounded cursor-not-allowed text-xs opacity-70"
                          disabled
                          value=""
                        >
                          <option value="">Sin números</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <Dialpad onCall={(num) => handleCall(num, selectedCallerId)} />
              </>
            )}
          </div>

          {/* FOOTER: Fixed Actions (Like Google Voice "Hide Keypad") */}
        </div>

        {/* FOOTER: Transparent Audio Test */}
        <div className="w-full p-2 flex justify-center mt-auto">
          <button
            onClick={() => handleCall('888888', selectedCallerId)}
            className="flex items-center px-3 py-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-600 transition-colors uppercase tracking-wider"
            title="Verify microphone and speakers"
          >
            <Activity className="w-3 h-3 mr-1.5" />
            Prueba de Audio
          </button>
        </div>
      </div>


      {/* Removed Duplicate View Content Blocks from here */}

      {/* DIALER MODE LAYOUT */}
      {dialerMode && (
        !currentLead ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50 flex-col">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mb-4"></div>
            <p className="text-gray-500 font-medium">Buscando siguiente lead...</p>
            <button onClick={() => setDialerMode(false)} className="mt-8 text-red-400 hover:text-red-500 text-sm">Cancelar</button>
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
                      Power Dialer Activo v2.9
                    </span>
                  </div>
                </div>

                {/* Grid Fields (Editable) - Single Row Layout */}
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="col-span-1 space-y-1">
                    <label className="text-xs font-bold text-black uppercase tracking-wider">Referido Por</label>
                    <input
                      type="text"
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-xs"
                      value={currentLead.referred_by || ''}
                      onChange={(e) => setCurrentLead((prev: any) => ({ ...prev, referred_by: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <label className="text-xs font-bold text-black uppercase tracking-wider">Ciudad</label>
                    <div className="relative">
                      <Building className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-8 p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-xs"
                        value={currentLead.city || ''}
                        onChange={(e) => setCurrentLead((prev: any) => ({ ...prev, city: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-bold text-black uppercase tracking-wider">Dirección</label>
                    <div className="relative">
                      <MapPin className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-8 p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-xs"
                        value={currentLead.address || ''}
                        onChange={(e) => setCurrentLead((prev: any) => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Text Areas */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block">Info General</label>
                    <textarea
                      rows={3}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 leading-relaxed focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all resize-none"
                      value={currentLead.general_info || ''}
                      onChange={(e) => setCurrentLead((prev: any) => ({ ...prev, general_info: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block">Observaciones del Rep</label>
                    <textarea
                      rows={2}
                      className="w-full p-3 bg-yellow-50 border border-yellow-100 rounded-xl text-gray-700 leading-relaxed focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 transition-all resize-none"
                      value={currentLead.rep_notes || ''}
                      onChange={(e) => setCurrentLead((prev: any) => ({ ...prev, rep_notes: e.target.value }))}
                    />
                  </div>

                  <div className="relative group">
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block">
                      Observaciones TLMK (Historial)
                    </label>
                    <div className="p-3 bg-blue-50 rounded-xl text-gray-700 text-sm leading-relaxed border border-blue-100 max-h-32 overflow-y-auto w-full">
                      {currentLead.tlmk_notes || 'No history'}
                    </div>
                  </div>

                  {/* NEW COMMENTS FIELD */}
                  <div>
                    <label className="text-xs font-bold text-black uppercase tracking-wider mb-1 block flex items-center justify-between">
                      <span>Comentarios de la Llamada (Actual)</span>
                      <button onClick={() => {
                        const noteInput = document.getElementById('current-call-notes') as HTMLTextAreaElement;
                        if (noteInput) handleCopy(noteInput.value);
                      }} className="text-cyan-600 hover:text-cyan-700 text-xs font-bold flex items-center" title="Copiar">
                        <Copy className="w-3 h-3 mr-1" /> Copiar
                      </button>
                    </label>
                    <textarea
                      id="current-call-notes"
                      rows={4}
                      placeholder="Escribe notas para esta llamada..."
                      className="w-full p-3 bg-white border border-gray-300 rounded-xl text-gray-900 leading-relaxed focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all shadow-sm resize-none"
                      value={currentLead.notes || ''}
                      onChange={(e) => setCurrentLead((prev: any) => ({ ...prev, notes: e.target.value }))}
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

                {/* --- VICIDIAL STYLE MANUAL CONTROLS (ALWAYS VISIBLE) --- */}
                <div className="w-full bg-gray-800 p-2 mb-4 rounded-lg flex items-center justify-between shadow-inner">
                  <div className="text-[10px] text-green-400 font-mono flex flex-col">
                    <span>ESTADO: {callStatus}</span>
                    <span>DISP: {device ? 'READY' : 'NULL'}</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        console.log("FORCE ANSWER");
                        if (device) {
                          const conns = (device as any).connections;
                          if (conns && conns.length > 0) {
                            const active = conns[0];
                            active.accept();
                            setActiveCall(active);
                            setCallStatus("In Call (Forced)");
                          } else {
                            alert("No connection found to answer (Force Mode).");
                          }
                        }
                      }}
                      className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded border border-green-500 shadow-sm active:scale-95"
                    >
                      FORZAR RESPUESTA
                    </button>
                    <button
                      onClick={() => {
                        if (device) device.disconnectAll();
                        setCallStatus("Ready");
                        setActiveCall(null);
                      }}
                      className="px-3 py-1 bg-red-900 hover:bg-red-800 text-white text-xs font-bold rounded border border-red-700 shadow-sm active:scale-95"
                    >
                      COLGAR TODO
                    </button>
                  </div>
                </div>
                {/* ------------------------------------------------------- */}
                {/* --- CALL CONTROL PANEL (Logic Refactored v4.0) --- */}
                {renderCallPanel()}

              </div>

              {/* MIDDLE: Status List (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-3 bg-gray-50/50">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 mb-2 block">Resultado (Selección múltiple)</label>
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
                  <span className="text-[10px] uppercase font-bold tracking-wider">Atrás</span>
                </button>
                <button onClick={handleSkipLead} className="flex flex-col items-center justify-center p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowDownLeft className="w-4 h-4 mb-1 rotate-[-90deg]" />
                  <span className="text-[10px] uppercase font-bold tracking-wider">Saltar</span>
                </button>
                <button onClick={handleNextLead} className="flex flex-col items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <ArrowDownLeft className="w-4 h-4 mb-1 rotate-[-135deg]" /> {/* Next Icon Proxy */}
                  <span className="text-[10px] uppercase font-bold tracking-wider">Siguiente</span>
                </button>
              </div>
            </div>
          </div>
        ))}

      {/* MOBILE SIDEBAR OVERLAY */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black z-50 2xl:hidden"
            />
            {/* Sidebar Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-3/4 max-w-xs bg-white z-50 shadow-2xl flex flex-col 2xl:hidden"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${isDeviceReady ? 'bg-purple-600' : 'bg-gray-400'}`}>
                    {user?.email?.[0].toUpperCase() || 'G'}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-gray-900 truncate max-w-[150px]">{user?.email || 'Guest'}</p>
                    <p className="text-xs text-green-600 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span> Online
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 ml-2">Menú Principal</h3>

                <button onClick={() => { handleViewChange('calls'); setActiveMobileTab('calls'); setIsSidebarOpen(false); }} className="w-full flex items-center text-gray-700 hover:bg-blue-50 hover:text-blue-600 p-3 rounded-xl transition-all font-medium">
                  <Phone className="w-5 h-5 mr-3" /> Llamadas
                </button>
                <button onClick={() => { handleViewChange('messages'); setActiveMobileTab('messages'); setIsSidebarOpen(false); }} className="w-full flex items-center text-gray-700 hover:bg-blue-50 hover:text-blue-600 p-3 rounded-xl transition-all font-medium">
                  <MessageSquare className="w-5 h-5 mr-3" /> Mensajes
                </button>
                <button onClick={() => { setActiveMobileTab('voicemail'); setIsSidebarOpen(false); }} className="w-full flex items-center text-gray-700 hover:bg-blue-50 hover:text-blue-600 p-3 rounded-xl transition-all font-medium">
                  <div className="w-5 h-5 border-b-2 border-l-2 border-current rotate-45 transform mt-[-4px] mr-3"></div> Buzón de voz
                </button>

                {userRole === 'admin' && (
                  <>
                    <div className="my-4 border-t border-gray-100"></div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 ml-2">Administración</h3>
                    <button onClick={() => window.location.href = '/admin'} className="w-full flex items-center text-gray-700 hover:bg-blue-50 hover:text-blue-600 p-3 rounded-xl transition-all font-medium">
                      <Shield className="w-5 h-5 mr-3" /> Admin Panel
                    </button>
                  </>
                )}
              </nav>

              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    if (confirm('Cerrar sesión?')) window.location.href = '/login';
                  }}
                  className="w-full flex items-center justify-center text-red-500 hover:bg-red-50 p-3 rounded-xl transition-all font-bold"
                >
                  <LogOut className="w-5 h-5 mr-2" /> Cerrar Sesión
                </button>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div >
  )
}
