'use client';

import { useState } from 'react';
import { Phone, Delete, Activity } from 'lucide-react';

export default function Dialpad({
    onCall
}: {
    onCall: (number: string) => void
}) {
    const [number, setNumber] = useState('');

    const handlePress = (digit: string) => {
        setNumber((prev) => prev + digit);
    };

    const handleDelete = () => {
        setNumber((prev) => prev.slice(0, -1));
    };

    const handleCall = () => {
        if (number) {
            onCall(number);
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
            <div className="mt-4 w-full px-4">
                <button
                    onClick={() => onCall('888888')}
                    className="w-full py-2 bg-gray-50 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-100 hover:text-green-600 transition-colors flex items-center justify-center border border-dashed border-gray-300"
                    title="Verify microphone and speakers"
                >
                    <Activity className="w-3 h-3 mr-1" />
                    Test Audio (Loopback)
                </button>
            </div>
        </div>
    );
}
