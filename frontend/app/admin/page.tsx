'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { Shield, Users, Phone, BarChart3, Clock, ArrowUpRight, UserPlus, Loader2, Plus, Trash2, Edit } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { useAgentStatus } from '@/providers/AgentStatusContext';

const API_BASE_URL = 'https://gibbor-voice-production.up.railway.app';

// Helper to format seconds to HH:MM:SS
function formatDuration(seconds: number) {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function AgentTimer({ startTime }: { startTime: string }) {
    const [duration, setDuration] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            const start = new Date(startTime).getTime();
            const now = new Date().getTime();
            const diff = Math.floor((now - start) / 1000);

            const h = Math.floor(diff / 3600).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');

            setDuration(`${h}:${m}:${s}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    return <span className="font-mono text-gray-500 text-sm ml-2 bg-gray-100 px-2 py-0.5 rounded">{duration}</span>;
}

export default function AdminPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const { onlineUsers } = useAgentStatus(); // Use Global Context

    const [stats, setStats] = useState({
        totalCalls: 0,
        totalSales: 0,
        activeAgents: 0
    });
    const [loading, setLoading] = useState(true);

    // Agent Creation State
    const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
    const [newAgent, setNewAgent] = useState({ email: '', password: '', fullName: '' });
    const [creating, setCreating] = useState(false);
    const [usersList, setUsersList] = useState<any[]>([]); // New State

    // Number Assignment Modal State
    const [isNumberModalOpen, setIsNumberModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingUserName, setEditingUserName] = useState('');
    const [availableTwilioNumbers, setAvailableTwilioNumbers] = useState<any[]>([]);
    const [assignedNumbers, setAssignedNumbers] = useState<string[]>([]);
    const [callbackNumber, setCallbackNumber] = useState('');
    const [savingNumbers, setSavingNumbers] = useState(false);

    // Protect Route
    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setUser(user);

            const { data } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (data?.role !== 'admin' && user.email !== 'info@gibborcenter.com' && user.email !== 'admin@gibborcenter.com') {
                router.push('/'); // Kick non-admins back to agent dashboard
            } else {
                fetchStats();
            }
        };
        checkAdmin();

        // Auto-refresh stats every 5 seconds
        const intervalId = setInterval(() => {
            fetchStats();
        }, 5000);

        // Fetch all Twilio numbers once for the modal
        fetchAvailableNumbers();

        return () => clearInterval(intervalId);

        return () => clearInterval(intervalId);
    }, []);

    const fetchStats = async () => {
        try {
            // 1. Fetch Users & Their specific "Today" stats (from Backend)
            let calculatedTotalCalls = 0;
            const usersRes = await fetch(`${API_BASE_URL}/users`);
            if (usersRes.ok) {
                const profiles = await usersRes.json();
                setUsersList(profiles);
                // Calculate Total Calls from the accurate per-user "callsToday"
                calculatedTotalCalls = profiles.reduce((acc: number, user: any) => acc + (user.stats?.callsToday || 0), 0);
            }

            // 2. Fetch General Reports (for Sales/Leads)
            const res = await fetch(`${API_BASE_URL}/reports`);
            if (res.ok) {
                const data = await res.json();
                setStats({
                    totalCalls: calculatedTotalCalls, // Use the summed value
                    totalSales: (data.status_counts['Sale'] || 0) + (data.status_counts['Venta'] || 0) + (data.status_counts['Cita'] || 0),
                    activeAgents: 0 // Will be updated by presence
                });
            }
        } catch (error) {
            console.error("Error fetching admin stats:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE_URL}/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAgent)
            });
            if (!res.ok) throw new Error('Failed to create agent');
            alert('Agente creado exitosamente');
            setIsAgentModalOpen(false);
            setNewAgent({ email: '', password: '', fullName: '' });
            fetchStats(); // Refresh list
        } catch (err: any) {
            alert(err.message);
        } finally {
            setCreating(false);
        }
    };

    // --- NUMBER ASSIGNMENT LOGIC ---

    const fetchAvailableNumbers = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/phone-numbers`); // No userId = fetch all
            if (res.ok) {
                const data = await res.json();
                setAvailableTwilioNumbers(data.numbers || []);
            }
        } catch (e) {
            console.error("Error fetching all numbers:", e);
        }
    };

    const openNumberModal = (user: any) => {
        setEditingUserId(user.id);
        setEditingUserName(user.full_name || user.email);
        setAssignedNumbers(user.assigned_caller_ids || []);
        setCallbackNumber(user.callback_number || '');
        setIsNumberModalOpen(true);
    };

    const toggleNumberAssignment = (phoneNumber: string) => {
        setAssignedNumbers(prev => {
            if (prev.includes(phoneNumber)) {
                return prev.filter(n => n !== phoneNumber);
            } else {
                return [...prev, phoneNumber];
            }
        });
    };

    const handleSaveNumbers = async () => {
        if (!editingUserId) return;
        setSavingNumbers(true);
        try {
            const res = await fetch(`${API_BASE_URL}/agents/${editingUserId}/numbers`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assigned_caller_ids: assignedNumbers,
                    callback_number: callbackNumber
                })
            });

            if (!res.ok) throw new Error("Failed to update numbers");

            alert("¡Números actualizados exitosamente!");
            setIsNumberModalOpen(false);
            fetchStats(); // Refresh user list to show updated data if we displayed it
        } catch (e: any) {
            alert("Error: " + e.message);
        } finally {
            setSavingNumbers(false);
        }
    };


    const handleDeleteAgent = async (agentId: string, agentName: string) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar a ${agentName}? Esta acción no se puede deshacer.`)) return;

        try {
            const res = await fetch(`${API_BASE_URL}/agents/${agentId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete agent');
            alert('Agente eliminado exitosamente');
            fetchStats(); // Refresh list
        } catch (err: any) {
            alert('Error deleting agent: ' + err.message);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-indigo-600">Loading Admin Panel...</div>;

    const onlineCount = onlineUsers.length;

    return (
        <div className="flex h-screen bg-gray-50 font-sans">
            <Sidebar currentView="admin" userRole="admin" />

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm z-10">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                        <Shield className="w-6 h-6 mr-3 text-indigo-600" />
                        Panel de Administración
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500">Bienvenido, Admin</span>
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                            A
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Total Llamadas (Hoy)</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{stats.totalCalls}</h3>
                                </div>
                                <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                                    <Phone className="w-6 h-6" />
                                </div>
                            </div>
                            <div className="flex items-center text-sm text-green-600">
                                <ArrowUpRight className="w-4 h-4 mr-1" />
                                <span className="font-medium">+12%</span>
                                <span className="text-gray-400 ml-2">desde ayer</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Total Ventas/Leads</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{stats.totalSales}</h3>
                                </div>
                                <div className="p-3 bg-green-50 rounded-lg text-green-600">
                                    <BarChart3 className="w-6 h-6" />
                                </div>
                            </div>
                            <div className="flex items-center text-sm text-green-600">
                                <ArrowUpRight className="w-4 h-4 mr-1" />
                                <span className="font-medium">+5%</span>
                                <span className="text-gray-400 ml-2">tasa de conversión</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Agentes Activos</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{onlineCount}</h3>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                                    <Users className="w-6 h-6" />
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 mt-2 flex items-center">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                {onlineCount} En línea ahora
                            </p>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        {/* ... existing Quick Actions ... */}
                    </div>

                    {/* Team Members List */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center">
                                <Users className="w-5 h-5 mr-2 text-indigo-600" />
                                Miembros del Equipo
                            </h3>
                            <button onClick={() => fetchStats()} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                                Actualizar
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3">Nombre</th>
                                        <th className="px-6 py-3">Email</th>
                                        <th className="px-6 py-3">Rol</th>
                                        <th className="px-6 py-3 text-center">Llamadas Hoy</th>
                                        <th className="px-6 py-3 text-center">Tiempo Online</th>
                                        <th className="px-6 py-3 text-center">Tiempo Offline</th>
                                        <th className="px-6 py-3">Estado</th>
                                        <th className="px-6 py-3">Último Login</th>
                                        <th className="px-6 py-3">Visto por última vez</th>
                                        <th className="px-6 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {usersList.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                                                No se encontraron usuarios.
                                            </td>
                                        </tr>
                                    ) : (
                                        usersList.map((u) => (
                                            <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-gray-900">
                                                    {u.full_name || '—'}
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                                                    {u.email}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {u.role || 'agent'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center font-mono text-gray-700">
                                                    {u.stats?.callsToday || 0}
                                                </td>
                                                <td className="px-6 py-4 text-center font-mono text-gray-700">
                                                    {formatDuration(u.stats?.secondsOnline || 0)}
                                                </td>
                                                <td className="px-6 py-4 text-center font-mono text-gray-700">
                                                    {formatDuration(u.stats?.secondsOffline || 0)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {onlineUsers.find(on => on.email === u.email) ? (
                                                        <span className="flex items-center text-green-600 text-xs font-bold">
                                                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                                                            Online
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs flex items-center">
                                                            <div className="w-2 h-2 bg-gray-300 rounded-full mr-2"></div>
                                                            Offline
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-xs">
                                                    {u.stats?.lastLogin ? new Date(u.stats.lastLogin).toLocaleString() : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-xs">
                                                    {u.stats?.lastSeen ? new Date(u.stats.lastSeen).toLocaleString() : 'Never'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => openNumberModal(u)}
                                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors mr-2"
                                                        title="Manage Numbers"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAgent(u.id, u.full_name || u.email)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete User"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* User Management Actions */}
                    <div className="mt-8 mb-8">
                        <h3 className="font-bold text-gray-800 flex items-center mb-4">
                            <UserPlus className="w-5 h-5 mr-2 text-indigo-600" />
                            Gestión de Usuarios
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <button
                                onClick={() => setIsAgentModalOpen(true)}
                                className="flex items-center p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left group"
                            >
                                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Plus className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <h4 className="font-bold text-gray-900">Agregar Nuevo Agente</h4>
                                    <p className="text-sm text-gray-500 mt-1">Crear cuenta para nuevo miembro</p>
                                </div>
                            </button>
                        </div>
                    </div>

                </main>
            </div>

            {/* Create Agent Modal */}
            {isAgentModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h2 className="text-xl font-bold mb-4 text-gray-900">Crear Nuevo Agente</h2>
                        <form onSubmit={handleCreateAgent}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={newAgent.fullName}
                                        onChange={(e) => setNewAgent({ ...newAgent, fullName: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        placeholder="agent@gibbor.com"
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={newAgent.email}
                                        onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={newAgent.password}
                                        onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })}
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Min. 6 characters</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setIsAgentModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                                >
                                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Crear Agente
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Number Assignment Modal */}
            {isNumberModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">Gestionar Números para {editingUserName}</h2>
                            <button onClick={() => setIsNumberModalOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close Modal">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2">
                            {/* Callback Number Section */}
                            <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">
                                    Número de Retorno (Callback)
                                </label>
                                <input
                                    type="text"
                                    value={callbackNumber}
                                    onChange={(e) => setCallbackNumber(e.target.value)}
                                    placeholder="+15550001234"
                                    className="w-full p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-blue-600 mt-2">
                                    Este número se mostrará al agente como el número de &quot;Retorno de Llamada&quot;.
                                </p>
                            </div>

                            {/* Number Selection Grid */}
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Identificadores de Llamada Asignables</h3>

                            {availableTwilioNumbers.length === 0 ? (
                                <p className="text-gray-500 italic">No se encontraron números en Twilio.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {availableTwilioNumbers.map((num) => {
                                        const isAssigned = assignedNumbers.includes(num.phoneNumber);
                                        return (
                                            <div
                                                key={num.phoneNumber}
                                                onClick={() => toggleNumberAssignment(num.phoneNumber)}
                                                className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${isAssigned
                                                    ? 'bg-indigo-50 border-indigo-500 shadow-sm'
                                                    : 'bg-white border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <div className="flex items-center">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${isAssigned ? 'bg-indigo-600 border-indigo-600' : 'border-gray-400'
                                                        }`}>
                                                        {isAssigned && <Plus className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-mono text-sm font-medium text-gray-900">{num.phoneNumber}</p>
                                                        {num.friendlyName && num.friendlyName !== num.phoneNumber && (
                                                            <p className="text-xs text-gray-500 truncate max-w-[150px]">{num.friendlyName}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${num.type === 'Twilio' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
                                                    }`}>
                                                    {num.type}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                            <button
                                onClick={() => setIsNumberModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveNumbers}
                                disabled={savingNumbers}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center font-bold shadow-md active:scale-95 transition-all"
                            >
                                {savingNumbers && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Guardar Asignaciones
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
