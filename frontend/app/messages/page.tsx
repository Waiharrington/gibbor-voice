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
                    // Optional: auto-select logic
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

            ) : (
        // Empty State
        <div className="flex-1 flex flex-col items-center justify-center bg-white text-gray-500">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <ImageIcon className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-xl font-medium text-gray-700 mb-2">Select a conversation</h3>
            <p className="max-w-xs text-center text-sm">Choose from the list on the left to start chatting.</p>
        </div>
    )
}

{/* 4. Details Panel (Right) */ }
{
    selectedConversationId && (
        <div className="hidden xl:flex w-72 border-l border-gray-200 flex-col bg-white p-6">
            <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-cyan-500 rounded-full flex items-center justify-center text-white text-2xl font-semibold mb-4 shadow-sm">
                    {selectedConversationId.slice(-2)}
                </div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">{selectedConversationId}</h2>
                <p className="text-sm text-gray-500 mb-6">Mobile • US</p>

                <div className="w-full space-y-3">
                    <button className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                        <Info className="w-4 h-4 mr-2" />
                        People info
                    </button>
                </div>
            </div>
        </div>
    )
}
        </div >
    );
}
