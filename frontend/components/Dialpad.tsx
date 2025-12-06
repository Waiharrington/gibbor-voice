'use client';

import { useState, useEffect } from 'react';
import { Phone, Delete, ChevronDown } from 'lucide-react';

export default function Dialpad({ onCall }: { onCall: (number: string, callerId?: string) => void }) {
    const [number, setNumber] = useState('');
    const [availableNumbers, setAvailableNumbers] = useState<{ phoneNumber: string, friendlyName: string, type: 'Twilio' | 'Verified' }[]>([]);
    const [selectedFrom, setSelectedFrom] = useState<string>('');

    // Fetch available numbers
    useEffect(() => {
        const fetchNumbers = async () => {
            try {
                const res = await fetch('https://gibbor-voice-production.up.railway.app/phone-numbers');
                if (res.ok) {
                    const data = await res.json();
                    setAvailableNumbers(data);
                    if (data.length > 0) setSelectedFrom(data[0].phoneNumber);
                }
            } catch (e) {
                console.error("Failed to fetch numbers", e);
            }
        };
        fetchNumbers();
    }, []);

    const handlePress = (digit: string) => {
        setNumber((prev) => prev + digit);
    };

    const handleDelete = () => {
        setNumber((prev) => prev.slice(0, -1));
    };

    const handleCall = () => {
        if (number) {
            onCall(number, selectedFrom);
        }
    };

    const digits = [
        '1', '2', '3',
        '4', '5', '6',
        '7', '8', '9',
        '*', '0', '#'
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-80 p-6 flex flex-col items-center">
            {/* From Selector */}
            {availableNumbers.length > 0 && (
                <div className="w-full mb-4">
                    <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">Call From:</label>
                    <div className="relative">
                        <select
                            value={selectedFrom}
                            onChange={(e) => setSelectedFrom(e.target.value)}
                            className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-2 px-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                            title="Select Caller ID"
                            aria-label="Select Caller ID"
                        >
                            {availableNumbers.map((n) => (
                                <option key={n.phoneNumber} value={n.phoneNumber}>
                                    {n.friendlyName || n.phoneNumber} {n.type === 'Verified' ? '(Verified)' : ''}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <ChevronDown className="h-4 w-4" />
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full mb-6 relative">
                <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full text-3xl text-center font-light text-gray-800 outline-none border-b border-transparent focus:border-green-500 transition-colors pb-2"
                    placeholder="Enter number"
                />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
                {digits.map((digit) => (
                    <button
                        key={digit}
                        onClick={() => handlePress(digit)}
                        className="w-16 h-16 rounded-full hover:bg-gray-100 flex items-center justify-center text-2xl font-medium text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                    >
                        {digit}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-center space-x-8 w-full">
                <div className="w-12" /> {/* Spacer */}
                <button
                    onClick={handleCall}
                    disabled={!number}
                    className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center shadow-md transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Call"
                    aria-label="Call"
                >
                    <Phone className="w-8 h-8 fill-current" />
                </button>
                <button
                    onClick={handleDelete}
                    className="w-12 h-12 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center transition-colors"
                    title="Delete"
                    aria-label="Delete"
                >
                    <Delete className="w-6 h-6" />
                </button>
            </div>
        </div >
    );
}
