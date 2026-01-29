'use client';

import { useState } from 'react';
import { Phone, Delete } from 'lucide-react';

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

    return (
        <div className="w-full flex flex-col items-center">
            {/* Display */}
            <div className="w-full mb-4 relative flex items-center justify-center min-h-[48px]">
                <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full text-3xl text-center text-gray-800 bg-transparent outline-none font-normal tracking-wide"
                    placeholder="Enter number"
                />
                {number && (
                    <button
                        onClick={handleDelete}
                        className="absolute right-0 text-gray-500 hover:text-gray-700 p-2"
                    >
                        <Delete className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Keypad Grid */}
            <div className="grid grid-cols-3 w-full gap-y-3 mb-6 place-items-center">
                {digits.map((item) => (
                    <button
                        key={item.digit}
                        onClick={() => handlePress(item.digit)}
                        className="w-16 h-16 rounded-full hover:bg-gray-100 flex flex-col items-center justify-center transition-colors focus:outline-none active:bg-gray-200"
                    >
                        <span className="text-2xl text-gray-700 font-normal">{item.digit}</span>
                        {item.letters && (
                            <span className="text-[10px] text-gray-400 font-medium tracking-widest mt-[-2px]">{item.letters}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Call Button */}
            <div className="flex items-center justify-center w-full">
                <button
                    onClick={handleCall}
                    disabled={!number}
                    className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Call"
                    aria-label="Call"
                >
                    <Phone className="w-7 h-7 fill-current" />
                </button>
            </div>


        </div>
    );
}

const digits = [
    { digit: '1', letters: '' },
    { digit: '2', letters: 'ABC' },
    { digit: '3', letters: 'DEF' },
    { digit: '4', letters: 'GHI' },
    { digit: '5', letters: 'JKL' },
    { digit: '6', letters: 'MNO' },
    { digit: '7', letters: 'PQRS' },
    { digit: '8', letters: 'TUV' },
    { digit: '9', letters: 'WXYZ' },
    { digit: '*', letters: '' },
    { digit: '0', letters: '+' },
    { digit: '#', letters: '' }
];
