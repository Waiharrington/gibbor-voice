import Link from 'next/link';
import { Phone, Clock, MessageSquare, Settings, User, BarChart3 } from 'lucide-react';

interface SidebarProps {
    currentView?: string;
    onViewChange?: (view: string) => void;
}

export default function Sidebar({ currentView, onViewChange }: SidebarProps) {
    const handleNav = (view: string, e: React.MouseEvent) => {
        if (onViewChange) {
            e.preventDefault();
            onViewChange(view);
        }
    };

    return (
        <aside className="w-64 bg-gray-50 border-r border-gray-200 h-screen flex flex-col">
            <div className="p-4 flex items-center space-x-2 border-b border-gray-100">
                <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold">
                    G
                </div>
                <span className="text-xl font-semibold text-gray-700">Gibbor Voice</span>
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
                <ul className="space-y-1">
                    <li>
                        <a
                            href="/"
                            onClick={(e) => handleNav('calls', e)}
                            className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${currentView === 'calls' ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <Phone className="w-5 h-5 mr-3 text-gray-500" />
                            Calls
                        </a>
                    </li>
                    <li>
                        <a
                            href="/messages"
                            onClick={(e) => handleNav('messages', e)}
                            className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${currentView === 'messages' ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <MessageSquare className="w-5 h-5 mr-3 text-gray-500" />
                            Messages
                        </a>
                    </li>
                    <li>
                        <a
                            href="/campaigns"
                            onClick={(e) => handleNav('campaigns', e)}
                            className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${currentView === 'campaigns' ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <BarChart3 className="w-5 h-5 mr-3 text-gray-500" />
                            Campaigns
                        </a>
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
