
'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowDownLeft, ArrowUpRight, Phone, MessageSquare, Download, Clock, MapPin, Mic, MicOff, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import AudioPlayer from './AudioPlayer';

interface HistoryPanelProps {
    calls: any[];
    isLoading: boolean;
    onCall: (number: string) => void;
    onMessage: (number: string) => void;
    selectedCallerId: string;
}

export default function HistoryPanel({
    calls,
    isLoading,
    onCall,
    onMessage,
    selectedCallerId
}: HistoryPanelProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCall, setSelectedCall] = useState<any | null>(null);

    const filteredCalls = useMemo(() => {
        return calls.filter(call => {
            const search = searchQuery.toLowerCase();
            const from = (call.from || '').toLowerCase();
            const to = (call.to || '').toLowerCase();
            return from.includes(search) || to.includes(search);
        });
    }, [calls, searchQuery]);

    const formatCallerID = (phoneNumber: string) => {
        const cleaned = phoneNumber.replace(/\D/g, '');
        const match = cleaned.match(/^(\d{1})?(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return `(${match[2] || cleaned.slice(0, 3)}) ${match[3] || cleaned.slice(3, 6)}-${match[4] || cleaned.slice(6)}`;
        }
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

    return (
        <div className="flex flex-1 h-full bg-white overflow-hidden">

            {/* 1. List Column */}
            <div className="w-full md:w-96 flex flex-col border-r border-gray-100 shrink-0">
                <div className="p-4 border-b border-gray-50">
                    <div className="flex items-center bg-gray-100 rounded-xl px-4 h-11 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                        <Search className="w-4 h-4 text-gray-400 mr-3" />
                        <input
                            type="text"
                            placeholder="Buscar historial..."
                            className="bg-transparent border-none outline-none text-sm w-full text-gray-700"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Cargando...</div>
                    ) : filteredCalls.length === 0 ? (
                        <div className="p-10 text-center text-gray-400 text-sm">No se encontraron llamadas</div>
                    ) : (
                        filteredCalls.map((call, index) => (
                            <div
                                key={call.id}
                                onClick={() => setSelectedCall(call)}
                                className={`p-4 flex items-center cursor-pointer transition-colors border-l-4 ${selectedCall?.id === call.id ? 'bg-blue-50/50 border-blue-600' : 'border-transparent hover:bg-gray-50'}`}
                            >
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 mr-4 shadow-sm ${getAvatarColor(call.direction === 'inbound' ? (call.from || '#') : (call.to || '#'))}`}>
                                    {call.direction === 'inbound' ? (call.from?.[1]?.toUpperCase() || '#') : (call.to?.[1]?.toUpperCase() || '#')}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-0.5">
                                        <h3 className="text-sm font-bold text-gray-800 truncate">
                                            {call.direction === 'outbound' ? formatCallerID(call.to) : formatCallerID(call.from)}
                                        </h3>
                                        <span className="text-[10px] text-gray-400 font-medium ml-2">
                                            {call.created_at && format(new Date(call.created_at), 'MMM d')}
                                        </span>
                                    </div>
                                    <div className="flex items-center text-xs text-gray-500">
                                        {call.direction === 'outbound' ? <ArrowUpRight className="w-3 h-3 mr-1 text-gray-400" /> : <ArrowDownLeft className="w-3 h-3 mr-1 text-purple-500" />}
                                        <span className="truncate">{call.direction === 'inbound' ? 'Entrante' : 'Saliente'} • {call.duration || 0}s</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 2. Detail View */}
            <div className="flex-1 flex flex-col bg-white">
                {selectedCall ? (
                    <div className="h-full flex flex-col overflow-y-auto">
                        <header className="h-20 border-b border-gray-100 flex justify-between items-center px-8 shrink-0">
                            <div className="flex flex-col">
                                <h2 className="text-xl font-bold text-gray-900">
                                    {selectedCall.direction === 'outbound' ? formatCallerID(selectedCall.to) : formatCallerID(selectedCall.from)}
                                </h2>
                                <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mt-0.5">Detalles de la Llamada</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => onMessage(selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from)}
                                    className="p-3 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 rounded-2xl text-gray-500 transition-all"
                                    title="Enviar Mensaje"
                                >
                                    <MessageSquare className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => onCall(selectedCall.direction === 'outbound' ? selectedCall.to : selectedCall.from)}
                                    className="p-3 bg-gray-50 hover:bg-green-50 hover:text-green-600 rounded-2xl text-gray-500 transition-all"
                                    title="Llamar"
                                >
                                    <Phone className="w-5 h-5" />
                                </button>
                            </div>
                        </header>

                        <div className="p-8 space-y-8">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Estado</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${selectedCall.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                        <span className="text-lg font-bold text-gray-800 capitalize">{selectedCall.status}</span>
                                    </div>
                                </div>
                                <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Duración</p>
                                    <span className="text-lg font-bold text-gray-800">{selectedCall.duration || 0} segundos</span>
                                </div>
                            </div>

                            {/* Recording Section */}
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                        <Mic className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900">Grabación de Voz</h3>
                                </div>

                                {selectedCall.recording_url ? (
                                    <>
                                        <AudioPlayer src={selectedCall.recording_url} />
                                        <div className="mt-6 flex justify-end">
                                            <a href={selectedCall.recording_url} download target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors">
                                                <Download className="w-4 h-4" /> DESCARGAR AUDIO
                                            </a>
                                        </div>
                                    </>
                                ) : (
                                    <div className="py-12 border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center text-gray-300">
                                        <MicOff className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm font-medium">No hay grabación disponible</p>
                                    </div>
                                )}
                            </div>

                            {/* Deep Metadata Grid */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Fecha y Hora</span>
                                    </div>
                                    <p className="text-sm font-bold text-gray-700">
                                        {selectedCall.created_at ? format(new Date(selectedCall.created_at), 'PPPPpppp') : '-'}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                                        <MapPin className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Ubicación</span>
                                    </div>
                                    <p className="text-sm font-bold text-gray-700">
                                        {selectedCall.to_city || 'Desconocida'}, {selectedCall.to_state || '-'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 p-10 text-center">
                        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                            <Phone className="w-10 h-10 opacity-20" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-400">Selecciona una llamada</h3>
                        <p className="max-w-[200px] text-sm mt-2">Haz clic en cualquier registro del historial para ver detalles y grabaciones.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
