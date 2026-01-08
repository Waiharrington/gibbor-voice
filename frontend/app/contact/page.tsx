'use client';

import Sidebar from '@/components/Sidebar';
import { Mail } from 'lucide-react';

export default function Contact() {
    return (
        <div className="flex h-screen bg-white">
            <Sidebar currentView="contacts" userRole="agent" />
            <main className="flex-1 flex flex-col bg-gray-50">
                <header className="h-16 border-b border-gray-200 flex items-center px-8 bg-white">
                    <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                        <Mail className="w-5 h-5 mr-3 text-gray-600" />
                        Contact Us
                    </h1>
                </header>

                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-2xl font-bold text-gray-800 mb-6">Get in Touch</h2>

                        <form className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                <input type="text" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500" placeholder="John Doe" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                <input type="tel" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500" placeholder="+1 (555) 000-0000" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                                <textarea className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 h-32" placeholder="How can we help you?"></textarea>
                            </div>

                            {/* TWILIO COMPLIANCE CHECKBOX - CRITICAL */}
                            <div className="flex items-start">
                                <div className="flex items-center h-5">
                                    <input
                                        id="sms-consent"
                                        name="sms-consent"
                                        type="checkbox"
                                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                                    />
                                </div>
                                <div className="ml-3 text-sm">
                                    <label htmlFor="sms-consent" className="font-medium text-gray-700">SMS Consent</label>
                                    <p className="text-gray-500">
                                        I agree to receive SMS text messages from Gibborcenter regarding my inquiries and support requests.
                                        Message frequency varies. Message & Data rates may apply.
                                        Reply STOP to cancel.
                                        <a href="#" className="text-green-600 ml-1 hover:underline">Privacy Policy</a>
                                    </p>
                                </div>
                            </div>

                            <button type="button" className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors">
                                Send Message
                            </button>
                        </form>

                        <div className="mt-8 pt-8 border-t border-gray-100 text-center text-sm text-gray-500">
                            <p>Gibborcenter - 1450 S West Temple, Salt Lake City, UT 84115-5203</p>
                            <p className="mt-1">info@gibborcenter.com | +1 786-245-3182</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
