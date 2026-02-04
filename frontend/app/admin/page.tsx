'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { Shield, Users, Phone, BarChart3, ArrowUpRight, UserPlus, Loader2, Plus, Trash2, Edit, Globe, MapPin } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { useAgentStatus } from '@/providers/AgentStatusContext';

const API_BASE_URL = 'https://gibbor-voice-production.up.railway.app';

export default function AdminPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const { onlineUsers } = useAgentStatus();

    const [stats, setStats] = useState({
        totalCalls: 0,
        totalSales: 0,
        activeAgents: 0
    });
    const [loading, setLoading] = useState(true);

    // Data State
    const [usersList, setUsersList] = useState<any[]>([]);
    const [zones, setZones] = useState<any[]>([]);

    // Modals State
    const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
    const [newAgent, setNewAgent] = useState({ email: '', password: '', fullName: '' });
    const [creating, setCreating] = useState(false);

    // Zone Management Modals
    const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
    const [newZone, setNewZone] = useState({ name: '', callback_number: '' });

    const [isZoneNumbersModalOpen, setIsZoneNumbersModalOpen] = useState(false);
    const [selectedZone, setSelectedZone] = useState<any>(null);
    const [availableTwilioNumbers, setAvailableTwilioNumbers] = useState<any[]>([]);
    const [selectedZoneNumbers, setSelectedZoneNumbers] = useState<string[]>([]);
    const [savingZone, setSavingZone] = useState(false);

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
                router.push('/');
            } else {
                fetchStats();
            }
        };
        checkAdmin();

        const intervalId = setInterval(() => {
            fetchStats();
        }, 5000);

        return () => clearInterval(intervalId);
    }, []);

    const fetchStats = async () => {
        try {
            // 1. Fetch Users & Their specific "Today" stats
            let calculatedTotalCalls = 0;
            const usersRes = await fetch(`${API_BASE_URL}/users`);
            if (usersRes.ok) {
                const profiles = await usersRes.json();
                setUsersList(profiles);
                calculatedTotalCalls = profiles.reduce((acc: number, user: any) => acc + (user.stats?.callsToday || 0), 0);
            }

            // 2. Fetch Zones
            const zonesRes = await fetch(`${API_BASE_URL}/zones`);
            if (zonesRes.ok) {
                setZones(await zonesRes.json());
            }

            // 3. Fetch General Reports
            const res = await fetch(`${API_BASE_URL}/reports`);
            if (res.ok) {
                const data = await res.json();
                setStats({
                    totalCalls: calculatedTotalCalls,
                    totalSales: (data.status_counts['Sale'] || 0) + (data.status_counts['Venta'] || 0) + (data.status_counts['Cita'] || 0),
                    activeAgents: onlineUsers.length
                });
            }
        } catch (error) {
            console.error("Error fetching admin stats:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- AGENT MGMT ---

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
            fetchStats();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setCreating(false);
        }
    };

    // --- DEBUG / DIAGNOSTIC ---
    const [debugData, setDebugData] = useState<any>(null);
    const [isDebugOpen, setIsDebugOpen] = useState(false);

    const handleDiagnose = async (userId: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/debug/user/${userId}`);
            const data = await res.json();
            setDebugData(data);
            setIsDebugOpen(true);
        } catch (e) {
            alert("Error running diagnosis");
        }
    };

    const fetchTwilioNumbers = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/phone-numbers`);
            if (res.ok) {
                const data = await res.json();
                setAvailableTwilioNumbers(data.numbers || []);
            }
        } catch (e) {
            console.error("Error fetching numbers", e);
        }
    };

    const handleDeleteAgent = async (agentId: string, agentName: string) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar a ${agentName}? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`${API_BASE_URL}/agents/${agentId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete agent');
            alert('Agente eliminado exitosamente');
            fetchStats();
        } catch (err: any) {
            alert('Error deleting agent: ' + err.message);
        }
    };

    const handleUpdateUserZone = async (userId: string, zoneId: string | null) => {
        try {
            const res = await fetch(`${API_BASE_URL}/users/${userId}/zone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ zone_id: zoneId })
            });
            if (!res.ok) throw new Error("Failed to update user zone");
            fetchStats();
        } catch (e: any) {
            alert(e.message);
        }
    };

    // --- ZONE MGMT ---

    const handleCreateZone = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE_URL}/zones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newZone)
            });
            if (!res.ok) throw new Error('Failed to create zone');
            alert('Zona creada exitosamente');
            setIsZoneModalOpen(false);
            setNewZone({ name: '', callback_number: '' });
            fetchStats();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setCreating(false);
        }
    };

    const openZoneNumbersModal = async (zone: any) => {
        setSelectedZone(zone);
        setSavingZone(true); // Re-using loading state
        try {
            await fetchTwilioNumbers();

            // Query Zone's numbers (reusing Supabase as localized helper)
            const { data: zoneData } = await supabase
                .from('zones')
                .select('zone_numbers(phone_number)')
                .eq('id', zone.id)
                .single();

            if (zoneData) {
                setSelectedZoneNumbers(zoneData.zone_numbers.map((zn: any) => zn.phone_number));
            }
            setIsZoneNumbersModalOpen(true);
        } catch (e) {
            console.error("Error preparing zone modal", e);
        } finally {
            setSavingZone(false);
        }
    };

    const toggleNumberInZone = (phoneNumber: string) => {
        setSelectedZoneNumbers(prev => {
            if (prev.includes(phoneNumber)) return prev.filter(n => n !== phoneNumber);
            return [...prev, phoneNumber];
        });
    };

    const handleSaveZoneNumbers = async () => {
        if (!selectedZone) return;
        setSavingZone(true);
        try {
            // First, delete all existing numbers for this zone (simplest sync approach)
            // But wait, my endpoint is "add" and "delete". 
            // "Sync" is easiest: Delete all then Add all? Or just Add new ones?
            // To be safe and avoid Unique constraint errors, let's use a smarter backend endpoint or logic.
            // My backend has POST (add) and DELETE (remove).
            // Let's diff them.

            // Current assigned (db): need to know what they were. 
            // Alternatively, I'll validly just "Add all selected" but handle conflicts?
            // Actually, backend INSERT will fail if dupes?
            // Let's use a "Sync" strategy: Delete all for zone -> Insert all selected. 
            // But I didn't verify if I added a "Delete ALL" endpoint.
            // I only added DELETE matching specific numbers.

            // BETTER: Add "Sync" endpoint? No, let's just do it in two steps if needed.
            // Or simpler:
            // 1. Get current DB numbers for zone.
            // 2. Identify Added vs Removed.
            // 3. Call ADD for added.
            // 4. Call DELETE for removed.

            const { data: currentData } = await supabase
                .from('zone_numbers')
                .select('phone_number')
                .eq('zone_id', selectedZone.id);

            const currentNumbers = currentData?.map(c => c.phone_number) || [];

            const toAdd = selectedZoneNumbers.filter(n => !currentNumbers.includes(n));
            const toRemove = currentNumbers.filter(n => !selectedZoneNumbers.includes(n));

            if (toAdd.length > 0) {
                await fetch(`${API_BASE_URL}/zones/${selectedZone.id}/numbers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ numbers: toAdd })
                });
            }

            if (toRemove.length > 0) {
                await fetch(`${API_BASE_URL}/zones/${selectedZone.id}/numbers`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ numbers: toRemove })
                });
            }

            alert("Números de zona actualizados");
            setIsZoneNumbersModalOpen(false);
            fetchStats();
        } catch (e: any) {
            alert("Error: " + e.message);
        } finally {
            setSavingZone(false);
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
                        </div>
                    </div>


                    {/* ZONE MANAGEMENT SECTION */}
                    <div className="mb-8">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 flex items-center">
                                <Globe className="w-5 h-5 mr-2 text-indigo-600" />
                                Gestión de Zonas
                            </h3>
                            <button
                                onClick={() => {
                                    setIsZoneModalOpen(true);
                                    fetchTwilioNumbers(); // Fetch numbers for dropdown
                                }}
                                className="text-sm bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-100 font-medium flex items-center"
                            >
                                <Plus className="w-4 h-4 mr-1" /> Nueva Zona
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {zones.map(zone => (
                                <div key={zone.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-lg text-gray-800">{zone.name}</h4>
                                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                                            {zone.numberCount} núms
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-500 mb-4 flex items-center gap-1">
                                        <Phone className="w-3 h-3" /> Callback: {zone.callback_number || 'N/A'}
                                    </div>
                                    <button
                                        onClick={() => openZoneNumbersModal(zone)}
                                        className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100"
                                    >
                                        Gestionar Números
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>


                    {/* AGENT LIST SECTION */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center">
                                <Users className="w-5 h-5 mr-2 text-indigo-600" />
                                Miembros del Equipo
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsAgentModalOpen(true)}
                                    className="text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 font-medium flex items-center shadow-lg hover:shadow-xl transition-all"
                                >
                                    <UserPlus className="w-4 h-4 mr-1" /> Nuevo Agente
                                </button>
                                <button onClick={() => fetchStats()} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-2">
                                    Actualizar
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3">Nombre</th>
                                        <th className="px-6 py-3">Email</th>
                                        <th className="px-6 py-3">Rol</th>
                                        <th className="px-6 py-3 text-center">Llamadas Hoy</th>
                                        <th className="px-6 py-3">Estado</th>
                                        <th className="px-6 py-3">Última Llamada</th>
                                        <th className="px-6 py-3">Zona Asignada</th>
                                        <th className="px-6 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {usersList.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                                                No se encontraron usuarios.
                                            </td>
                                        </tr>
                                    ) : (
                                        usersList.map((u) => (
                                            <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-gray-900">{u.full_name || '—'}</td>
                                                <td className="px-6 py-4 text-gray-600 font-mono text-xs">{u.email}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {u.role || 'agent'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center font-mono text-gray-700 font-bold">
                                                    {u.stats?.callsToday || 0}
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
                                                    {u.stats?.lastCall ? new Date(u.stats.lastCall).toLocaleString() : '—'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        className="bg-gray-50 border border-gray-300 text-gray-700 text-xs rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2"
                                                        value={u.zone_id || ""}
                                                        onChange={(e) => handleUpdateUserZone(u.id, e.target.value || null)}
                                                    >
                                                        <option value="">Sin Zona</option>
                                                        {zones.map(z => (
                                                            <option key={z.id} value={z.id}>{z.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleDeleteAgent(u.id, u.full_name || u.email)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Eliminar Usuario"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDiagnose(u.id)}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-1"
                                                        title="Diagnosticar"
                                                    >
                                                        <div className="w-4 h-4 font-mono text-[10px] border border-current rounded flex items-center justify-center">?</div>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>

            {/* CREATE AGENT MODAL */}
            {isAgentModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h2 className="text-xl font-bold mb-4 text-gray-900">Crear Nuevo Agente</h2>
                        <form onSubmit={handleCreateAgent}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                    <input type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900" value={newAgent.fullName} onChange={(e) => setNewAgent({ ...newAgent, fullName: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input type="email" className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                    <input type="password" className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900" value={newAgent.password} onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })} required />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setIsAgentModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={creating} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center">
                                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Crear
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CREATE ZONE MODAL */}
            {isZoneModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h2 className="text-xl font-bold mb-4 text-gray-900">Crear Nueva Zona</h2>
                        <form onSubmit={handleCreateZone}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Zona</label>
                                    <input type="text" placeholder="Ej: Venezuela, Colombia..." className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Número de Retorno (Callback)</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 font-mono text-gray-900 bg-white"
                                        value={newZone.callback_number}
                                        onChange={(e) => setNewZone({ ...newZone, callback_number: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Seleccionar un Número Twilio --</option>
                                        {availableTwilioNumbers.length > 0 ? (
                                            availableTwilioNumbers.map(num => (
                                                <option key={num.phoneNumber} value={num.phoneNumber}>
                                                    {num.phoneNumber} ({num.friendlyName})
                                                </option>
                                            ))
                                        ) : (
                                            <option disabled>Cargando números...</option>
                                        )}
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setIsZoneModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={creating} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center">
                                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Crear Zona
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ZONE NUMBERS MODAL */}
            {isZoneNumbersModalOpen && selectedZone && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">Números para zona: {selectedZone.name}</h2>
                            <button onClick={() => setIsZoneNumbersModalOpen(false)} className="text-gray-400 hover:text-gray-600"><Plus className="w-6 h-6 rotate-45" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            {savingZone ? <div className="text-center p-10"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" /></div> : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {availableTwilioNumbers.map((num) => {
                                        const isAssigned = selectedZoneNumbers.includes(num.phoneNumber);
                                        return (
                                            <div key={num.phoneNumber} onClick={() => toggleNumberInZone(num.phoneNumber)} className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${isAssigned ? 'bg-indigo-50 border-indigo-500' : 'hover:border-indigo-300'}`}>
                                                <div className="flex items-center">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${isAssigned ? 'bg-indigo-600 border-indigo-600' : 'border-gray-400'}`}>
                                                        {isAssigned && <Plus className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-mono text-sm font-bold">{num.phoneNumber}</p>
                                                        <p className="text-xs text-gray-500">{num.friendlyName}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                            <button onClick={() => setIsZoneNumbersModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                            <button onClick={handleSaveZoneNumbers} disabled={savingZone} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}

            {/* DEBUG MODAL */}
            {isDebugOpen && debugData && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
                    <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-2xl m-4 max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">Diagnóstico de Usuario</h2>
                            <button onClick={() => setIsDebugOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-900 rounded-lg p-4">
                            <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap">
                                {JSON.stringify(debugData, null, 2)}
                            </pre>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                                    alert("Copiado al portapapeles");
                                }}
                                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                            >
                                Copiar JSON
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
