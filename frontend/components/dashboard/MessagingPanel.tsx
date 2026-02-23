
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Image as ImageIcon, Phone, MoreVertical, Search, ArrowLeft, X, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/utils/supabaseClient';

interface MessagingPanelProps {
    conversations: any[];
    messages: any[];
    isLoading: boolean;
    userId: string | null;
    apiBaseUrl: string;
    onCall: (number: string) => void;
    normalizePhoneNumber: (phone: string) => string;
    initialConvId?: string | null;
}

export default function MessagingPanel({
    conversations,
    messages,
    isLoading,
    userId,
    apiBaseUrl,
    onCall,
    normalizePhoneNumber,
    initialConvId
}: MessagingPanelProps) {
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-select conversation based on prop
    useEffect(() => {
        if (initialConvId) {
            setSelectedConvId(initialConvId);
        }
    }, [initialConvId]);

    // Filtered Conversations
    const filteredConversations = useMemo(() => {
        return conversations.filter(conv =>
            conv.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [conversations, searchQuery]);

    // Active Messages
    const activeMessages = useMemo(() => {
        if (!selectedConvId) return [];
        return messages
            .filter(m => (m.direction === 'outbound' ? normalizePhoneNumber(m.to) : normalizePhoneNumber(m.from)) === selectedConvId)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }, [messages, selectedConvId, normalizePhoneNumber]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeMessages]);

    const handleSend = async () => {
        if (!body.trim() || !selectedConvId) return;

        setIsSending(true);
        try {
            const response = await fetch(`${apiBaseUrl}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedConvId,
                    body,
                    userId
                }),
            });

            if (!response.ok) throw new Error('Failed to send');
            setBody('');
        } catch (err) {
            console.error('Send error:', err);
            alert('Error al enviar mensaje');
        } finally {
            setIsSending(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedConvId) return;

        setIsSending(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${selectedConvId}/${fileName}`;

            const { error: uploadError } = await supabase.storage.from('mms').upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('mms').getPublicUrl(filePath);

            await fetch(`${apiBaseUrl}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedConvId,
                    body: '',
                    mediaUrl: data.publicUrl,
                    userId
                }),
            });
        } catch (err) {
            console.error('MMS error:', err);
            alert('Error al enviar imagen');
        } finally {
            setIsSending(false);
        }
    };

    const formatCallerID = (phoneNumber: string) => {
        const cleaned = phoneNumber.replace(/\D/g, '');
        if (cleaned.length === 10) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        return phoneNumber;
    };

    return (
        <div className="flex flex-1 h-full bg-white overflow-hidden">

            {/* 1. Conversations List */}
            <div className={`w-full md:w-80 flex flex-col border-r border-gray-100 ${selectedConvId ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-gray-50">
                    <div className="flex items-center bg-gray-100 rounded-xl px-4 h-11 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                        <Search className="w-4 h-4 text-gray-400 mr-3" />
                        <input
                            type="text"
                            placeholder="Buscar chats..."
                            className="bg-transparent border-none outline-none text-sm w-full text-gray-700"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Cargando...</div>
                    ) : filteredConversations.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => setSelectedConvId(conv.id)}
                            className={`p-4 flex items-center cursor-pointer transition-colors border-l-4 ${selectedConvId === conv.id ? 'bg-blue-50/50 border-blue-600' : 'border-transparent hover:bg-gray-50'}`}
                        >
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0 mr-3">
                                {conv.id.slice(-2)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <h3 className="text-sm font-bold text-gray-800 truncate">{formatCallerID(conv.id)}</h3>
                                    <span className="text-[10px] text-gray-400 font-medium ml-2">
                                        {new Date(conv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 truncate">
                                    {conv.lastMessage.direction === 'outbound' ? 'Tú: ' : ''}
                                    {conv.lastMessage.media_url ? '📷 Imagen' : conv.lastMessage.body}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. Chat View */}
            <div className={`flex-1 flex flex-col bg-white ${selectedConvId ? 'flex' : 'hidden md:flex'}`}>
                {selectedConvId ? (
                    <>
                        <header className="h-16 border-b border-gray-100 flex items-center px-6 justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedConvId(null)} className="md:hidden p-2 -ml-2 text-gray-400">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-[10px]">
                                    {selectedConvId.slice(-2)}
                                </div>
                                <h2 className="text-base font-bold text-gray-800">{formatCallerID(selectedConvId)}</h2>
                            </div>
                            <button
                                onClick={() => onCall(selectedConvId)}
                                className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors"
                            >
                                <Phone className="w-5 h-5" />
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30">
                            {activeMessages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex flex-col max-w-[75%] ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                                        {msg.media_url && (
                                            <div className="mb-1.5 overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                                                <img
                                                    src={msg.media_url}
                                                    alt="MMS"
                                                    className="max-h-60 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                                                    onClick={() => window.open(msg.media_url, '_blank')}
                                                />
                                            </div>
                                        )}
                                        {msg.body && (
                                            <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm ${msg.direction === 'outbound' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'}`}>
                                                {msg.body}
                                            </div>
                                        )}
                                        <span className="text-[9px] text-gray-400 mt-1 font-bold uppercase tracking-wider px-1">
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-white">
                            <div className="flex items-center gap-2 bg-gray-50 rounded-2xl p-2 border border-gray-100 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                                <label className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer">
                                    <ImageIcon className="w-5 h-5" />
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isSending} />
                                </label>
                                <input
                                    type="text"
                                    placeholder="Escribe un mensaje..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-800 py-2"
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!body.trim() || isSending}
                                    className={`p-2.5 rounded-xl transition-all ${body.trim() ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'bg-gray-200 text-gray-400'}`}
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 p-10 text-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <MessageSquare className="w-8 h-8 opacity-20" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-400">Tus Mensajes</h3>
                        <p className="text-sm mt-1">Selecciona una conversación para leer los mensajes.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
