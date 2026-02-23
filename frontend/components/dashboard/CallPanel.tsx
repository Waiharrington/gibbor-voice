
'use client';

import { useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Activity, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CallPanelProps {
    activeCall: any;
    callStatus: string;
    isMuted: boolean;
    isDeviceReady: boolean;
    duration: number;
    networkQuality: { mos: number, rtt: number } | null;
    onCall: (number: string) => void;
    onHangup: () => void;
    onToggleMute: () => void;
    onStopRingback: () => void;
    isTonePlaying: boolean;
    mapStatusToSpanish: (status: string) => string;
}

export default function CallPanel({
    activeCall,
    callStatus,
    isMuted,
    isDeviceReady,
    duration,
    networkQuality,
    onCall,
    onHangup,
    onToggleMute,
    onStopRingback,
    isTonePlaying,
    mapStatusToSpanish
}: CallPanelProps) {
    const [dialedNumber, setDialedNumber] = useState('');
    const [isKeypadOpen, setIsKeypadOpen] = useState(false);

    const formatDuration = (sec: number) => {
        const min = Math.floor(sec / 60);
        const s = sec % 60;
        return `${min}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleDial = (digit: string) => {
        setDialedNumber(prev => prev + digit);
    };

    const handleDelete = () => {
        setDialedNumber(prev => prev.slice(0, -1));
    };

    const digits = [
        { digit: '1', letters: '' }, { digit: '2', letters: 'ABC' }, { digit: '3', letters: 'DEF' },
        { digit: '4', letters: 'GHI' }, { digit: '5', letters: 'JKL' }, { digit: '6', letters: 'MNO' },
        { digit: '7', letters: 'PQRS' }, { digit: '8', letters: 'TUV' }, { digit: '9', letters: 'WXYZ' },
        { digit: '*', letters: '' }, { digit: '0', letters: '+' }, { digit: '#', letters: '' }
    ];

    return (
        <div className="w-full flex flex-col items-center">

            {/* 1. Connection Header */}
            <div className={`w-full py-1 text-center text-[10px] font-bold tracking-wider text-white transition-colors duration-500 rounded-t-xl ${isDeviceReady ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}>
                {isDeviceReady ? '● SISTEMA EN LÍNEA' : '○ DESCONECTADO - RECONECTANDO...'}
            </div>

            <div className="w-full bg-white p-6 rounded-b-xl shadow-sm border border-gray-100 flex flex-col items-center">

                {/* 2. Active Call or Dialer */}
                <AnimatePresence mode="wait">
                    {activeCall || (callStatus !== 'Disponible' && !callStatus.includes('Error')) ? (
                        <motion.div
                            key="active-ui"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="w-full flex flex-col items-center space-y-6"
                        >
                            {/* Call Timer & Status */}
                            <div className="text-center">
                                <div className="flex items-center justify-center space-x-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                    </span>
                                    <span className="font-mono text-3xl font-bold text-gray-800">{formatDuration(duration)}</span>
                                </div>
                                <p className="text-sm text-gray-500 font-semibold mt-2 uppercase tracking-wide">
                                    {mapStatusToSpanish(callStatus)}
                                </p>

                                {/* Network Quality */}
                                {networkQuality && (
                                    <div className="mt-3 flex items-center justify-center gap-3 bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[8px] text-gray-400 font-bold uppercase">Calidad</span>
                                            <span className={`text-[10px] font-bold ${networkQuality.mos > 3.5 ? 'text-emerald-500' : networkQuality.mos > 2.5 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                {networkQuality.mos > 3.5 ? 'Excelente' : networkQuality.mos > 2.5 ? 'Regular' : 'Pobre'}
                                            </span>
                                        </div>
                                        <div className="w-[1px] h-3 bg-gray-200"></div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[8px] text-gray-400 font-bold uppercase">Latencia</span>
                                            <span className="text-[10px] font-mono text-gray-700 font-medium">{Math.round(networkQuality.rtt)}ms</span>
                                        </div>
                                    </div>
                                )}

                                {/* Manual Silence (Failsafe) */}
                                {isTonePlaying && (
                                    <button
                                        onClick={onStopRingback}
                                        className="mt-3 text-[10px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-bold hover:bg-red-200 shadow-sm transition-colors"
                                    >
                                        Silenciar Tono (Manual)
                                    </button>
                                )}
                            </div>

                            {/* In-Call Controls */}
                            <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
                                {/* Answer Button (Visible only if incoming and not yet accepted) */}
                                {(callStatus.includes('Entrante') || callStatus.includes('Incoming')) && (
                                    <button
                                        onClick={() => activeCall?.accept()}
                                        className="col-span-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl animate-pulse shadow-lg flex items-center justify-center gap-3 border-2 border-emerald-400"
                                    >
                                        <Phone className="w-6 h-6" /> CONTESTAR
                                    </button>
                                )}

                                <button
                                    onClick={onToggleMute}
                                    className={`flex flex-col items-center justify-center h-16 rounded-2xl transition-all border shadow-sm ${isMuted ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                    <span className="text-[10px] mt-1 font-bold">{isMuted ? 'UNMUTE' : 'MUTE'}</span>
                                </button>

                                <button
                                    onClick={() => setIsKeypadOpen(!isKeypadOpen)}
                                    className={`flex flex-col items-center justify-center h-16 rounded-2xl transition-all border shadow-sm ${isKeypadOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <Activity className="w-6 h-6" />
                                    <span className="text-[10px] mt-1 font-bold">KEYPAD</span>
                                </button>

                                <button
                                    onClick={onHangup}
                                    className="flex flex-col items-center justify-center h-16 rounded-2xl bg-rose-500 text-white hover:bg-rose-600 shadow-md transition-all active:scale-95"
                                >
                                    <PhoneOff className="w-7 h-7" />
                                    <span className="text-[10px] mt-1 font-bold">HANGUP</span>
                                </button>
                            </div>

                            {/* DTMF Keypad */}
                            {isKeypadOpen && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="grid grid-cols-3 gap-2 w-full max-w-[280px] pt-4 border-t border-gray-100"
                                >
                                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                                        <button
                                            key={digit}
                                            onClick={() => activeCall?.sendDigits(digit)}
                                            className="h-12 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-700 transition-colors"
                                        >
                                            {digit}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="dialer-ui"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full flex flex-col items-center"
                        >
                            {/* Dialer Display */}
                            <div className="w-full mb-4 relative group">
                                <input
                                    type="text"
                                    value={dialedNumber}
                                    onChange={(e) => setDialedNumber(e.target.value)}
                                    className="w-full text-3xl text-center text-gray-800 bg-transparent outline-none font-light tracking-widest placeholder:text-gray-200"
                                    placeholder="000 000 0000"
                                />
                                {dialedNumber && (
                                    <button
                                        onClick={handleDelete}
                                        className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600 p-2 transition-colors"
                                        title="Borrar dígito"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                )}
                            </div>

                            {/* Keypad Grid */}
                            <div className="grid grid-cols-3 gap-x-4 gap-y-2 mb-4">
                                {digits.map((item) => (
                                    <button
                                        key={item.digit}
                                        onClick={() => handleDial(item.digit)}
                                        className="w-14 h-14 rounded-full hover:bg-gray-50 flex flex-col items-center justify-center transition-all focus:outline-none active:bg-gray-100 active:scale-95 group"
                                    >
                                        <span className="text-xl text-gray-700 font-medium group-hover:text-blue-600">{item.digit}</span>
                                        <span className="text-[7px] text-gray-400 font-bold tracking-[0.2em] mt-0.5 group-hover:text-blue-400 uppercase">{item.letters || '\u00A0'}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Action Button */}
                            <button
                                onClick={() => {
                                    if (dialedNumber) onCall(dialedNumber);
                                }}
                                disabled={!dialedNumber || !isDeviceReady}
                                className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-xl shadow-blue-200 transition-all active:scale-95 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed group"
                                title="Llamar"
                            >
                                <Phone className="w-6 h-6 fill-current group-hover:animate-pulse" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
