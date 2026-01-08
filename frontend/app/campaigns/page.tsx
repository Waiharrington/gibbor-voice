'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { supabase } from '@/utils/supabaseClient';
import { Plus, Trash2, Upload, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface Campaign {
    id: string;
    name: string;
    status: string;
    created_at: string;
    // leads_count? (We might need to fetch this separately or update backend to return it)
}

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedCampaignForUpload, setSelectedCampaignForUpload] = useState<string | null>(null);
    const [newCampaignName, setNewCampaignName] = useState('');
    const [fileAndMapping, setFileAndMapping] = useState<{ file: File | null, mapping: any }>({ file: null, mapping: {} });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const res = await fetch('https://gibbor-voice-production.up.railway.app/campaigns');
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data);
            }
        } catch (error) {
            console.error("Error fetching campaigns", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCampaign = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('https://gibbor-voice-production.up.railway.app/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCampaignName })
            });
            if (res.ok) {
                setIsCreateModalOpen(false);
                setNewCampaignName('');
                fetchCampaigns();
            }
        } catch (error) {
            alert("Error creating campaign");
        }
    };

    const handleDeleteCampaign = async (id: string) => {
        if (!confirm("Are you sure? This will delete all leads in this campaign.")) return;
        try {
            const res = await fetch(`https://gibbor-voice-production.up.railway.app/campaigns/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) fetchCampaigns();
        } catch (error) {
            alert("Error deleting campaign");
        }
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileAndMapping.file || !selectedCampaignForUpload) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', fileAndMapping.file);
        // Default mapping for now just to pass something, backend has fuzzy logic too
        formData.append('mapping', JSON.stringify({ phone: 'Phone', name: 'Name' }));

        try {
            const res = await fetch(`https://gibbor-voice-production.up.railway.app/campaigns/${selectedCampaignForUpload}/upload`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                alert("Leads uploaded successfully!");
                setIsUploadModalOpen(false);
                setSelectedCampaignForUpload(null);
                setFileAndMapping({ file: null, mapping: {} });
            } else {
                alert("Upload failed");
            }
        } catch (error) {
            console.error(error);
            alert("Error uploading file");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex h-screen bg-gray-50 font-sans">
            <Sidebar currentView="campaigns" userRole="admin" />

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-gray-200 px-8 py-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Campaigns</h1>
                        <p className="text-gray-500">Manage your calling lists and assign agents</p>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center shadow-lg transition-all"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        New Campaign
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    {loading ? (
                        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                    ) : campaigns.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">No campaigns yet</h3>
                            <p className="text-gray-500 mb-4">Create your first campaign to start calling.</p>
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="text-indigo-600 font-medium hover:underline"
                            >
                                Create now
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {campaigns.map((campaign) => (
                                <div key={campaign.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="text-lg font-bold text-gray-900">{campaign.name}</h3>
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${campaign.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {campaign.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 mb-6">Created: {new Date(campaign.created_at).toLocaleDateString()}</p>
                                    </div>

                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                                        <button
                                            onClick={() => {
                                                setSelectedCampaignForUpload(campaign.id);
                                                setIsUploadModalOpen(true);
                                            }}
                                            className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center justify-center"
                                        >
                                            <Upload className="w-4 h-4 mr-2" />
                                            Upload CSV
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCampaign(campaign.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h2 className="text-xl font-bold mb-4">Create New Campaign</h2>
                        <form onSubmit={handleCreateCampaign}>
                            <input
                                type="text"
                                placeholder="Campaign Name (e.g., December Sales)"
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-6 focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={newCampaignName}
                                onChange={(e) => setNewCampaignName(e.target.value)}
                                required
                            />
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h2 className="text-xl font-bold mb-2">Upload Leads</h2>
                        <p className="text-sm text-gray-500 mb-6">Upload a CSV file with columns: Phone, Name, etc.</p>

                        <form onSubmit={handleFileUpload}>
                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 mb-6 text-center hover:border-indigo-500 transition-colors cursor-pointer relative">
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => setFileAndMapping({ ...fileAndMapping, file: e.target.files?.[0] || null })}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                {fileAndMapping.file ? (
                                    <div className="flex flex-col items-center text-indigo-600">
                                        <FileText className="w-8 h-8 mb-2" />
                                        <span className="font-medium">{fileAndMapping.file.name}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-gray-400">
                                        <Upload className="w-8 h-8 mb-2" />
                                        <span>Click to select CSV</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setIsUploadModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                                <button
                                    type="submit"
                                    disabled={uploading || !fileAndMapping.file}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                                >
                                    {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Upload
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
