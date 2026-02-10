'use client';

import { useState } from 'react';
import { Save, PhoneOff } from 'lucide-react';

interface CallDispositionModalProps {
    isOpen: boolean;
    onClose: () => void;
    callSid?: string;
    leadId?: string; // Optional: If we want to link dispo to Lead too
}

const DISPOSITIONS = [
    'Sale / Venta',
    'Appointment / Cita',
    'Callback / Llamar más tarde',
    'Not Interested / No interesado',
    'Wrong Number / Número equivocado',
    'Voicemail / Buzón de voz',
    'No Answer / No contesta'
];

export default function CallDispositionModal({ isOpen, onClose, callSid }: CallDispositionModalProps) {
    const [disposition, setDisposition] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            // 1. Update Call Log (Generic)
            if (callSid) {
                await fetch(`https://gibbor-voice-production.up.railway.app/calls/${callSid}/disposition`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ disposition, notes })
                });
            }



            // Success
            onClose();
            setDisposition('');
            setNotes('');
        } catch (error) {
            alert("Error saving disposition.");
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-red-100 rounded-full text-red-600">
                        <PhoneOff className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Call Ended</h2>
                        <p className="text-sm text-gray-500">Please select an outcome to continue.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Disposition *</label>
                        <select
                            value={disposition}
                            onChange={(e) => setDisposition(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-800"
                            title="Select Outcome"
                            required
                        >
                            <option value="">Select Outcome...</option>
                            {DISPOSITIONS.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                            placeholder="Add call details..."
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={submitting || !disposition}
                            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                        >
                            {submitting ? 'Saving...' : (
                                <>
                                    <Save className="w-5 h-5" />
                                    Save Outcome
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
