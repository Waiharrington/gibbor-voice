'use client';

import { useState, useEffect } from 'react';
import { Upload, Plus, Play, Phone } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

interface Campaign {
    id: string;
    name: string;
    status: string;
    created_at: string;
}

export default function CampaignManager({ onStartDialer }: { onStartDialer: (campaignId: string) => void }) {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [newCampaignName, setNewCampaignName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        const res = await fetch('https://gibbor-voice-production.up.railway.app/campaigns');
        if (res.ok) {
            const data = await res.json();
            setCampaigns(data);
        }
    };

    const handleCreate = async () => {
        if (!newCampaignName.trim()) return;

        const res = await fetch('https://gibbor-voice-production.up.railway.app/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newCampaignName })
        });

        if (res.ok) {
            setNewCampaignName('');
            setIsCreating(false);
            fetchCampaigns();
        }
    };

    const handleFileUpload = async (campaignId: string, file: File) => {
        setUploadingId(campaignId);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`https://gibbor-voice-production.up.railway.app/campaigns/${campaignId}/upload`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                alert('Leads uploaded successfully!');
            } else {
                alert('Upload failed.');
            }
        } catch (e) {
            console.error(e);
            alert('Error uploading file');
        } finally {
            setUploadingId(null);
        }
    };

    return (
        <div className="flex-1 bg-white p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-gray-800">Campaigns</h1>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    New Campaign
                </button>
            </div>

            {isCreating && (
                <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-top-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Campaign Name</label>
                    <div className="flex gap-4">
                        <input
                            type="text"
                            value={newCampaignName}
                            onChange={(e) => setNewCampaignName(e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., December Sales"
                        />
                        <button
                            onClick={handleCreate}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => setIsCreating(false)}
                            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="grid gap-6">
                {campaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">{campaign.name}</h3>
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${campaign.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {campaign.status}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        Created {new Date(campaign.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3">
                                <label className="cursor-pointer inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors">
                                    <Upload className="w-4 h-4 mr-2 text-gray-500" />
                                    {uploadingId === campaign.id ? 'Uploading...' : 'Upload CSV'}
                                    <input
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        disabled={uploadingId === campaign.id}
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) handleFileUpload(campaign.id, e.target.files[0]);
                                        }}
                                    />
                                </label>
                                <button
                                    onClick={() => onStartDialer(campaign.id)}
                                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                                >
                                    <Play className="w-4 h-4 mr-2" />
                                    Start Dialer
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {campaigns.length === 0 && !isCreating && (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <Phone className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-medium text-gray-900">No campaigns yet</h3>
                        <p className="mt-1">Create a new campaign to start calling leads.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
