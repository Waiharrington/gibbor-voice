
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Phone, MessageSquare, Shield, LogOut, Menu, Activity, Search, MoreVertical, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgentStatus } from '@/providers/AgentStatusContext';

// Hooks
import { useAuth } from '@/hooks/useAuth';
import { useTwilioToken } from '@/hooks/useTwilioToken';
import { useTwilio } from '@/hooks/useTwilio';
import { useCallHistory } from '@/hooks/useCallHistory';
import { useMessaging } from '@/hooks/useMessaging';
import { usePhoneNumbers } from '@/hooks/usePhoneNumbers';

// Components
import CallPanel from '@/components/dashboard/CallPanel';
import HistoryPanel from '@/components/dashboard/HistoryPanel';
import MessagingPanel from '@/components/dashboard/MessagingPanel';
import CallDispositionModal from '@/components/CallDispositionModal';

const VERSION = 'v2.0.2-MODULAR';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://gibbor-voice-production.up.railway.app';

function NavIcon({ icon, label, active, onClick, expanded }: { icon: any, label: string, active: boolean, onClick: () => void, expanded?: boolean }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`relative flex items-center ${expanded ? 'justify-start px-4 w-full' : 'justify-center w-12'} h-12 rounded-full mb-3 transition-all duration-300
      ${active ? 'bg-blue-100/50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
      title={label}
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
        />
      )}
    </motion.button>
  );
}

export default function MainDashboard() {
  const [currentView, setCurrentView] = useState<'calls' | 'messages' | 'admin'>('calls');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [targetMessageNumber, setTargetMessageNumber] = useState<string | null>(null);
  const [isDialerVisible, setIsDialerVisible] = useState(false);
  const [isDispoModalOpen, setIsDispoModalOpen] = useState(false);
  const [lastCallSid, setLastCallSid] = useState<string | null>(null);

  // 1. Auth Logic
  const { user, userRole, isLoading: isAuthLoading } = useAuth();

  // 2. Global Status
  const { setCallStatus } = useAgentStatus();

  // 3. Token Logic
  const { token, refreshToken } = useTwilioToken({
    identity: user?.email || null,
    apiBaseUrl: API_BASE_URL
  });

  // 4. Phone Numbers
  const { availableNumbers, selectedCallerId, selectCallerId } = usePhoneNumbers({
    userId: user?.id || null,
    apiBaseUrl: API_BASE_URL
  });

  // 5. Twilio Engine
  const twilio = useTwilio({
    token,
    onTokenExpired: refreshToken,
    onStatusChange: setCallStatus
  });

  // 6. Data Streams
  const { calls, isLoading: isHistoryLoading } = useCallHistory({
    userId: user?.id || null,
    userRole,
    apiBaseUrl: API_BASE_URL
  });

  const { messages, conversations, isLoading: isMessagesLoading, normalizePhoneNumber } = useMessaging({
    userId: user?.id || null,
    userRole,
    apiBaseUrl: API_BASE_URL
  });

  // Logic to open Disposition Modal when call ends
  const prevActiveCall = useRef<any>(null);
  useEffect(() => {
    if (!twilio.activeCall && prevActiveCall.current) {
      // Call just ended
      const sid = prevActiveCall.current.parameters?.CallSid || prevActiveCall.current.sid;
      if (sid) {
        setLastCallSid(sid);
        setIsDispoModalOpen(true);
      }
    }
    prevActiveCall.current = twilio.activeCall;
  }, [twilio.activeCall]);

  // Mobile responsiveness
  useEffect(() => {
    if (twilio.activeCall) {
      const timeout = setTimeout(() => setIsDialerVisible(true), 0);
      return () => clearTimeout(timeout);
    }
  }, [twilio.activeCall]);

  const handleCall = useCallback((number: string) => {
    twilio.handleCall(number, selectedCallerId, user?.id || '');
    setIsDialerVisible(true);
  }, [twilio, selectedCallerId, user?.id]);

  const handleGoToMessage = useCallback((number: string) => {
    setTargetMessageNumber(normalizePhoneNumber(number));
    setCurrentView('messages');
  }, [normalizePhoneNumber]);

  if (isAuthLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white text-blue-600">
        <Activity className="w-12 h-12 animate-pulse mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest opacity-50">Alta-Voz Loading</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden text-gray-900 font-sans">

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-gray-900 text-white flex items-center px-4 z-50 shadow-md">
        <button className="p-2 mr-2 text-gray-300" onClick={() => setIsSidebarExpanded(true)}>
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex-1 bg-gray-800 rounded-full h-10 flex items-center px-4 mx-2">
          <Search className="w-4 h-4 text-gray-400 mr-2" />
          <input type="text" placeholder="Buscar en Alta-Voz" className="bg-transparent border-none outline-none text-sm text-white w-full" />
        </div>
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
          {user?.email?.[0].toUpperCase()}
        </div>
      </div>

      {/* Sidebar Navigation (Desktop) */}
      <aside className={`${isSidebarExpanded ? 'w-64' : 'w-20'} hidden lg:flex flex-col items-center py-6 bg-gray-50 border-r border-gray-200 transition-all duration-300 z-30`}>
        <button onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} className="p-3 mb-8 hover:bg-gray-200 rounded-full transition-colors text-gray-600">
          <Menu className="w-6 h-6" />
        </button>

        <nav className="flex-1 flex flex-col items-center w-full px-3">
          <NavIcon icon={<Phone className="w-6 h-6" />} label="Llamadas" active={currentView === 'calls'} onClick={() => setCurrentView('calls')} expanded={isSidebarExpanded} />
          <NavIcon icon={<MessageSquare className="w-6 h-6" />} label="Mensajes" active={currentView === 'messages'} onClick={() => setCurrentView('messages')} expanded={isSidebarExpanded} />
          {userRole === 'admin' && (
            <NavIcon icon={<Shield className="w-6 h-6" />} label="Administración" active={currentView === 'admin'} onClick={() => window.location.href = '/admin'} expanded={isSidebarExpanded} />
          )}
        </nav>

        <div className={`flex flex-col items-center w-full pb-4 ${isSidebarExpanded ? 'px-4' : ''}`}>
          <button onClick={() => window.location.href = '/login'} className={`flex items-center justify-center rounded-xl transition-all text-rose-500 hover:bg-rose-50 ${isSidebarExpanded ? 'w-full py-2.5 mb-4 gap-2 font-bold text-sm' : 'w-12 h-12 mb-4'}`}>
            <LogOut className="w-5 h-5" />
            {isSidebarExpanded && "Salir"}
          </button>
          <div className="relative group flex items-center">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-lg transition-all ${twilio.isDeviceReady ? 'bg-blue-600 shadow-blue-200' : 'bg-gray-400'}`}>
              {user?.email?.[0].toUpperCase()}
            </div>
            {isSidebarExpanded && (
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-bold text-gray-800 truncate">{user?.email}</p>
                <div className="flex items-center mt-1">
                  <div className={`w-2 h-2 rounded-full mr-2 ${twilio.isDeviceReady ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{twilio.isDeviceReady ? 'En Línea' : 'Desconectado'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Feature Area */}
      <main className="flex-1 flex flex-col lg:flex-row pt-16 lg:pt-0 overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {currentView === 'calls' && (
            <HistoryPanel
              calls={calls}
              isLoading={isHistoryLoading}
              onCall={handleCall}
              onMessage={handleGoToMessage}
              selectedCallerId={selectedCallerId}
            />
          )}
          {currentView === 'messages' && (
            <MessagingPanel
              conversations={conversations}
              messages={messages}
              isLoading={isMessagesLoading}
              userId={user?.id || null}
              apiBaseUrl={API_BASE_URL}
              onCall={handleCall}
              normalizePhoneNumber={normalizePhoneNumber}
              initialConvId={targetMessageNumber}
            />
          )}
        </div>

        {/* Right Panel (Desktop) / Full Screen (Mobile Dialer) */}
        <aside className={`
          bg-gray-50 border-l border-gray-200 flex flex-col shrink-0 transition-all duration-300
          ${isDialerVisible || twilio.activeCall ? 'fixed inset-0 z-[60] bg-white lg:relative lg:inset-auto lg:w-96 lg:flex' : 'hidden lg:w-96 lg:flex'}
        `}>
          <div className="lg:hidden h-16 border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
            <h2 className="font-bold text-gray-800">Marcador</h2>
            <button onClick={() => setIsDialerVisible(false)} className="p-2 text-gray-400">
              <Plus className="w-6 h-6 rotate-45" />
            </button>
          </div>

          <div className="p-6 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between mb-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Caller ID</label>
              <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{VERSION}</span>
            </div>
            <select
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
              value={selectedCallerId}
              onChange={(e) => selectCallerId(e.target.value)}
            >
              {availableNumbers.map(n => (
                <option key={n.phoneNumber} value={n.phoneNumber}>
                  {n.phoneNumber} ({n.friendlyName})
                </option>
              ))}
              <option value="client:agent">Testing (Agent)</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center bg-white lg:bg-transparent">
            <CallPanel
              activeCall={twilio.activeCall}
              callStatus={twilio.callStatus}
              isMuted={twilio.isMuted}
              isDeviceReady={twilio.isDeviceReady}
              duration={twilio.duration}
              networkQuality={twilio.networkQuality}
              onCall={handleCall}
              onHangup={twilio.handleHangup}
              onToggleMute={twilio.toggleMute}
              onStopRingback={twilio.stopRingback}
              isTonePlaying={twilio.isTonePlaying}
              mapStatusToSpanish={twilio.mapStatusToSpanish}
            />
            {!twilio.activeCall && (
              <button
                onClick={() => twilio.handleCall('888888', selectedCallerId, user?.id || '')}
                className="mt-8 flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-blue-500 transition-colors uppercase tracking-widest"
              >
                <Activity className="w-3.5 h-3.5" /> Probar Micrófono
              </button>
            )}
          </div>
        </aside>

        {/* Mobile FAB to trigger Dialer */}
        <AnimatePresence>
          {!isDialerVisible && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={() => setIsDialerVisible(true)}
              className="lg:hidden fixed bottom-24 right-6 w-16 h-16 bg-blue-600 text-white rounded-3xl shadow-2xl flex items-center justify-center z-50 focus:outline-none"
              title="Abrir Marcador"
            >
              <Phone className="w-8 h-8" />
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-100 flex justify-around items-center px-4 z-50">
        <button onClick={() => setCurrentView('calls')} className={`flex flex-col items-center gap-1 ${currentView === 'calls' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`p-2 rounded-xl ${currentView === 'calls' ? 'bg-blue-50' : ''}`}><Phone className="w-6 h-6" /></div>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Llamadas</span>
        </button>
        <button onClick={() => setCurrentView('messages')} className={`flex flex-col items-center gap-1 ${currentView === 'messages' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`p-2 rounded-xl ${currentView === 'messages' ? 'bg-blue-50' : ''}`}><MessageSquare className="w-6 h-6" /></div>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Mensajes</span>
        </button>
        <button onClick={() => window.location.href = '/admin'} className={`flex flex-col items-center gap-1 text-gray-400`}>
          <div className="p-2 rounded-xl"><Shield className="w-6 h-6" /></div>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Admin</span>
        </button>
      </nav>

      {/* Global Modals */}
      <CallDispositionModal
        isOpen={isDispoModalOpen}
        onClose={() => setIsDispoModalOpen(false)}
        callSid={lastCallSid || undefined}
      />

      {/* Version Display (Failsafe) */}
      <button
        onClick={() => window.location.reload()}
        className="hidden md:block fixed bottom-4 left-4 z-[100] bg-white/80 backdrop-blur-sm text-[8px] font-bold text-gray-400 px-2 py-1 rounded-md hover:bg-white hover:text-gray-600 transition-all border border-gray-100 shadow-sm"
      >
        RELOAD {VERSION}
      </button>

    </div>
  );
}
