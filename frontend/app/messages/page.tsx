'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { Send, Image as ImageIcon, Phone, MoreVertical, Search, Info } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

// Helper to group messages into conversations
const getConversationId = (msg: any) => {
    return msg.direction === 'outbound' ? msg.to : msg.from;
};

export default function Messages() {
    // State
    const [messages, setMessages] = useState<any[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Auto-scroll ref
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial Fetch
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await fetch('https://gibbor-voice-production.up.railway.app/history/messages');
                const data = await response.json();
                setMessages(data);

                // Select first conversation by default if none selected
                if (data.length > 0 && !selectedConversationId) {
                    const firstId = data[0].direction === 'outbound' ? data[0].to : data[0].from;
                    // Dont auto-select for now, let user choose? Or maybe yes like GV.
                    // Let's not auto-select to keep it clean.
                }
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
            await fetch('https://gibbor-voice-production.up.railway.app/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: selectedConversationId, body }),
            });
            setBody('');
        } catch (error) {
            console.error('Error sending:', error);
            // Error handling UI (toast?)
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex h-screen bg-white overflow-hidden">
            {/* 1. Sidebar (Navigation) */}
            <Sidebar />

            {/* 2. Conversations List (Left Panel) */}
            <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
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
                                    ? 'bg-blue-50 border-blue-600'
                                    : 'hover:bg-gray-50 border-transparent'
                                }`}
                        >
                            <div className="h-10 w-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-medium text-sm shrink-0 mr-3">
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

            {/* 3. Active Chat (Center Panel) */}
            {selectedConversationId ? (
                <div className="flex-1 flex flex-col bg-white min-w-0">
                    {/* Header */}
                    <header className="h-16 border-b border-gray-200 flex justify-between items-center px-6">
                        <div className="flex items-center">
                            <h2 className="text-lg font-medium text-gray-800">{selectedConversationId}</h2>
                        </div>
                        <div className="flex items-center space-x-4">
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
                                    {/* Image */}
                                    {msg.media_url && (
                                        <div className="mb-2">
                                            <img
                                                src={msg.media_url}
                                                alt="MMS"
                                                className="rounded-xl border border-gray-200 max-h-64 object-cover"
                                            />
                                        </div>
                                    )}
                                    {/* Text Bubble */}
                                    {msg.body && (
                                        <div className={`px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.direction === 'outbound'
                                                ? 'bg-blue-600 text-white rounded-tr-sm'
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
                        <div className="flex items-end bg-gray-50 rounded-xl border border-gray-200 p-2 focus-within:ring-1 focus-within:ring-green-500 transition-all">
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                                <ImageIcon className="w-5 h-5" />
                            </button>
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
                                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 text-sm text-gray-700 placeholder-gray-400 py-3 mx-2 h-11" // h-11 for vertical centering
                            />
                            <button
                                onClick={handleSend}
                                disabled={!body.trim() || isSending}
                                className={`p-2 rounded-full transition-colors ${body.trim()
                                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                // Empty State (No conversation selected)
                <div className="flex-1 flex flex-col items-center justify-center bg-white text-gray-500">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <ImageIcon className="w-10 h-10 text-gray-300" />
                    </div>
                    <h3 className="text-xl font-medium text-gray-700 mb-2">Select a conversation</h3>
                    <p className="max-w-xs text-center text-sm">Choose from the list on the left to start chatting.</p>
                </div>
            )}

            {/* 4. Details Panel (Right - Placeholder) */}
            {selectedConversationId && (
                <div className="hidden xl:flex w-72 border-l border-gray-200 flex-col bg-white p-6">
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-semibold mb-4 shadow-sm">
                            {selectedConversationId.slice(-2)}
                        </div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-1">{selectedConversationId}</h2>
                        <p className="text-sm text-gray-500 mb-6">Mobile • US</p>

                        <div className="w-full space-y-3">
                            <button className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                                <Info className="w-4 h-4 mr-2" />
                                People info
                            </button>
                            {/* Add more options like "Block", "Archive" later */}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
