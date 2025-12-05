import Link from 'next/link';
import { Phone, Clock, MessageSquare, Settings, User } from 'lucide-react';

export default function Sidebar() {
    return (
        <aside className="w-64 bg-gray-50 border-r border-gray-200 h-screen flex flex-col">
            <div className="p-4 flex items-center space-x-2 border-b border-gray-100">
                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                    G
                </div>
                <span className="text-xl font-semibold text-gray-700">Gibbor Voice</span>
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
                <ul className="space-y-1">
                    <li>
                        <Link href="/" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-200 transition-colors bg-gray-200 font-medium">
                            <Phone className="w-5 h-5 mr-3 text-gray-600" />
                            Calls
                        </Link>
                    </li>
                    <li>
                        <Link href="/messages" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 transition-colors">
                            <MessageSquare className="w-5 h-5 mr-3 text-gray-500" />
                            Messages
                        </Link>
                    </li>
                    <li>
                        <Link href="/history" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 transition-colors">
                            <Clock className="w-5 h-5 mr-3 text-gray-500" />
                            History
                        </Link>
                    </li>
                    <li>
                        <Link href="/contacts" className="flex items-center px-4 py-3 text-gray-600 hover:bg-gray-100 transition-colors">
                            <User className="w-5 h-5 mr-3 text-gray-500" />
                            Contacts
                        </Link>
                    </li>
                </ul>
            </nav>

            <div className="p-4 border-t border-gray-200">
                <Link href="/settings" className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                    <Settings className="w-5 h-5 mr-3 text-gray-500" />
                    Settings
                </Link>
            </div>
        </aside>
    );
}
