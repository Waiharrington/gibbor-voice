'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Send, MessageSquare } from 'lucide-react';

export default function Messages() {
    const [to, setTo] = useState('');
    const [body, setBody] = useState('');
    const [status, setStatus] = useState('');
    const [messages, setMessages] = useState<any[]>([]);

    // Fetch messages on mount
    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const response = await fetch('https://gibbor-voice-production.up.railway.app/history/messages');
                const data = await response.json();
                setMessages(data);
            } catch (error) {
                console.error('Error fetching messages:', error);
            }
        };

        fetchMessages();

        // Poll every 5 seconds for new messages (simple real-time)
        const interval = setInterval(fetchMessages, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSend = async () => {
        if (!to || !body) return;

        setStatus('Sending...');
        try {
            const response = await fetch('https://gibbor-voice-production.up.railway.app/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ to, body }),
            });

            const data = await response.json();

            if (response.ok) {
                setStatus('Sent!');
                // Optimistic update
                setMessages([...messages, { direction: 'outbound', to, body, created_at: new Date() }]);
                setBody('');
            } else {
                setStatus('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setStatus('Error sending message');
        }
    };

    return (
        <div className="flex h-screen bg-white">
            <Sidebar />
            <main className="flex-1 flex flex-col bg-gray-50">
                {/* Header */}
                <header className="h-16 border-b border-gray-200 flex items-center px-8 bg-white">
                    <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                        <MessageSquare className="w-5 h-5 mr-3 text-green-600" />
                        Messages
                    </h1>
                </header>

                <div className="flex-1 p-8 flex flex-col max-w-3xl mx-auto w-full">
                    {/* Compose Area */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">To:</label>
                            <input
                                type="text"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder="+1234567890"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        <div className="relative">
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Type a message..."
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all h-32 resize-none"
                            />
                            <button
                                onClick={handleSend}
                                className="absolute bottom-3 right-3 bg-green-600 text-white p-2 rounded-full hover:bg-green-700 transition-colors shadow-md"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                        {status && <p className="mt-2 text-sm text-gray-500">{status}</p>}
                    </div>

                    {/* History */}
                    <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`p-4 rounded-2xl max-w-md shadow-sm ${msg.direction === 'outbound'
                                    ? 'bg-green-100 text-gray-800 rounded-tr-none'
                                    : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                                    }`}>
                                    <p className={`font-medium text-xs mb-1 ${msg.direction === 'outbound' ? 'text-green-800' : 'text-gray-500'
                                        }`}>
                                        {msg.direction === 'outbound' ? `To: ${msg.to}` : `From: ${msg.from}`}
                                    </p>

                                    {/* Display Image if present */}
                                    {msg.media_url && (
                                        <div className="mb-2">
                                            <img
                                                src={msg.media_url}
                                                alt="MMS attachment"
                                                className="rounded-lg max-w-full h-auto max-h-64 object-cover border border-gray-200"
                                            />
                                        </div>
                                    )}

                                    <p>{msg.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
