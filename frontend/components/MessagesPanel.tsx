'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Send, Image as ImageIcon, Phone, MoreVertical, Search, Info, ArrowLeft } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

// Helper to group messages into conversations
const getConversationId = (msg: any) => {
    return msg.direction === 'outbound' ? msg.to : msg.from;
};

interface MessagesPanelProps {
    initialConversationId?: string | null;
    userId?: string | null;
    userRole?: string | null;
    onConversationSelect?: (id: string | null) => void;
}

export default function MessagesPanel({ initialConversationId, userId, userRole, onConversationSelect }: MessagesPanelProps) {
    // State
    const [messages, setMessages] = useState<any[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversationId || null);
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Auto-scroll ref
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Update parent when selection changes
    useEffect(() => {
        onConversationSelect?.(selectedConversationId);
    }, [selectedConversationId, onConversationSelect]);

    // Update selected conversation if prop changes
    useEffect(() => {
        if (initialConversationId) {
            setSelectedConversationId(initialConversationId);
        }
    }, [initialConversationId]);

    // Initial Fetch
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                let url = 'https://gibbor-voice-production.up.railway.app/history/messages';
                const params = new URLSearchParams();
                if (userId) params.append('userId', userId);
                if (userRole) params.append('role', userRole);

                if (params.toString()) url += `?${params.toString()}`;

                const response = await fetch(url);
                const data = await response.json();
                setMessages(data);
            } catch (error) {
                console.error('Error fetching messages:', error);
            }
        };

        fetchHistory();

        // Realtime Subscription
        const channel = supabase
            .channel('messages-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const newMsg = payload.new;
                setMessages((prev) => [...prev, newMsg]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, selectedConversationId]);

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

    // Active Conversation Messages
    const activeMessages = useMemo(() => {
        if (!selectedConversationId) return [];
        return messages.filter(m => getConversationId(m) === selectedConversationId);
    }, [messages, selectedConversationId]);

    // Handlers
    const handleSend = async () => {
        if (!body || !selectedConversationId) return;

        setIsSending(true);
        try {
            const response = await fetch('https://gibbor-voice-production.up.railway.app/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedConversationId,
                    body,
                    userId: userId // Pass User ID
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send SMS');
            }

            setBody('');
        } catch (error: any) {
            console.error('Error sending:', error);
            alert(`Error: ${error.message || 'Failed to send SMS'}`);
        } finally {
            setIsSending(false);
        }
    };

    // Image Upload Handler
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedConversationId) return;

        setIsSending(true);
        try {
            // 1. Upload to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${selectedConversationId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('mms')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data } = supabase.storage
                .from('mms')
                .getPublicUrl(filePath);

            const mediaUrl = data.publicUrl;

            // 3. Send Message with Media URL
            await fetch('https://gibbor-voice-production.up.railway.app/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedConversationId,
                    body: '',
                    mediaUrl: mediaUrl,
                    userId: userId // Pass User ID
                }),
            });

        } catch (error) {
            console.error('Error uploading/sending MMS:', error);
            alert('Error sending image. See console.');
        } finally {
            setIsSending(false);
            e.target.value = ''; // Reset input
        }
    };

    // Render 2-Column Layout (List | Chat)
    return (
        <div className="flex flex-1 h-full overflow-hidden">
            {/* 1. Conversations List (Left Panel) - Hidden on Mobile if Conversation Selected */}
            <div className={`w-full md:w-80 border-r border-gray-200 flex flex-col bg-white ${selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
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

                <div className="flex-1 overflow-y-auto">
                    {conversations.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => setSelectedConversationId(conv.id)}
                            className={`p-4 flex items-start cursor-pointer transition-colors border-l-4 ${selectedConversationId === conv.id
                                ? 'bg-cyan-50 border-cyan-500'
                                : 'hover:bg-gray-50 border-transparent'
                                }`}
                        >
                            <div className="h-10 w-10 rounded-full bg-cyan-500 flex items-center justify-center text-white font-medium text-sm shrink-0 mr-3">
                                {conv.id.slice(-2)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-1">
                                    <h3 className={`text-sm font-semibold truncate ${selectedConversationId === conv.id ? 'text-gray-900' : 'text-gray-700'}`}>
                                        {conv.id}
                                    </h3>
                                    <span className="text-xs text-gray-500 shrink-0 ml-2">
                                        {new Date(conv.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className={`text-xs truncate ${selectedConversationId === conv.id ? 'text-gray-700' : 'text-gray-500'}`}>
                                    {conv.lastMessage.direction === 'outbound' ? 'You: ' : ''}
                                    {conv.lastMessage.media_url ? '📷 Image' : conv.lastMessage.body}
                                </p>
                            </div>
                        </div>
                    ))}

                    {conversations.length === 0 && (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No messages yet.
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Active Chat (Center Panel) - Full Width on Mobile if Selected, Hidden if not */}
            <div className={`flex-1 flex-col bg-white min-w-0 min-h-0 h-full border-r border-gray-200 ${selectedConversationId ? 'flex' : 'hidden md:flex'}`}>
                {selectedConversationId ? (
                    <>
                        {/* Header */}
                        <header className="h-16 border-b border-gray-200 flex justify-between items-center px-4 md:px-6 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedConversationId(null)}
                                    className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <h2 className="text-lg font-medium text-gray-800">{selectedConversationId}</h2>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
                                    <Phone className="w-5 h-5" />
                                </button>
                                <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </div>
                        </header>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {activeMessages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex flex-col max-w-[70%] ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                                        {/* Image with improved loading */}
                                        {msg.media_url && (
                                            <div className="mb-2">
                                                <img
                                                    src={msg.media_url}
                                                    alt="MMS"
                                                    className="rounded-xl border border-gray-200 max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                    referrerPolicy="no-referrer"
                                                    onClick={() => window.open(msg.media_url, '_blank')}
                                                />
                                            </div>
                                        )}
                                        {/* Text Bubble */}
                                        {msg.body && (
                                            <div className={`px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.direction === 'outbound'
                                                ? 'bg-cyan-500 text-white rounded-tr-sm'
                                                : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                                                }`}>
                                                {msg.body}
                                            </div>
                                        )}
                                        <span className="text-[10px] text-gray-400 mt-1 px-1">
                                            {new Date(msg.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-gray-200">
                            <div className="flex items-end bg-gray-50 rounded-xl border border-gray-200 p-2 focus-within:ring-1 focus-within:ring-cyan-500 transition-all">
                                {/* Image Upload Button */}
                                <label className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors cursor-pointer">
                                    <ImageIcon className="w-5 h-5" />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={isSending}
                                    />
                                </label>

                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    placeholder="Type a message"
                                    className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 text-sm text-gray-700 placeholder-gray-400 py-3 mx-2 h-11"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!body.trim() || isSending}
                                    className={`p-2 rounded-full transition-colors ${body.trim()
                                        ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-md'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    // Empty State for Center Panel
                    <div className="flex-1 flex flex-col items-center justify-center bg-white text-gray-500 border-r border-gray-200">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <ImageIcon className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-xl font-medium text-gray-700 mb-2">Select a conversation</h3>
                        <p className="max-w-xs text-center text-sm">Choose from the list on the left to start chatting.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
