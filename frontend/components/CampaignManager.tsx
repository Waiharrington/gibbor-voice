'use client';

import { useState, useEffect } from 'react';
import { Upload, Plus, Play, Phone, Trash2, X, ArrowRight, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';

interface Campaign {
    id: string;
    name: string;
    status: string;
    created_at: string;
}

const SYSTEM_FIELDS = [
    { key: 'phone', label: 'Phone Number (Required)', required: true },
    { key: 'name', label: 'Lead Name' },
    { key: 'referred_by', label: 'Referred By' },
    { key: 'city', label: 'City' },
    { key: 'address', label: 'Address' },
    { key: 'general_info', label: 'General Info' },
    { key: 'rep_notes', label: 'Rep Notes' },
    { key: 'tlmk_notes', label: 'TLMK Notes' },
    { key: 'notes', label: 'General Notes' }, // fallback
];

export default function CampaignManager({ onStartDialer }: { onStartDialer: (campaignId: string) => void }) {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [newCampaignName, setNewCampaignName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Upload & Mapping State
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [isMappingOpen, setIsMappingOpen] = useState(false);
    const [currentFile, setCurrentFile] = useState<File | null>(null);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
    const [targetCampaignId, setTargetCampaignId] = useState<string | null>(null);

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
            console.error(error);
        }
    };

    const handleCreate = async () => {
        if (!newCampaignName.trim()) return;

        try {
            const res = await fetch('https://gibbor-voice-production.up.railway.app/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCampaignName })
            });

            if (res.ok) {
                setNewCampaignName('');
                setIsCreating(false);
                fetchCampaigns();
            } else {
                const err = await res.json();
                alert(`Error creating campaign: ${err.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error(error);
            alert('Failed to connect to server');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this campaign? All leads in it will be lost.')) return;

        try {
            const res = await fetch(`https://gibbor-voice-production.up.railway.app/campaigns/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchCampaigns();
            } else {
                alert('Failed to delete campaign');
            }
        } catch (e) {
            console.error(e);
            alert('Error deleting campaign');
        }
    };

    const onFileSelect = (campaignId: string, file: File) => {
        setTargetCampaignId(campaignId);
        setCurrentFile(file);

        // Parse Only Headers
        Papa.parse(file, {
            header: true,
            preview: 1, // Just first row to get headers
            step: (row) => {
                if (row.meta.fields) {
                    setCsvHeaders(row.meta.fields);
                    // Initialize mapping with smart guesses?
                    // Optional: could implement simple automap here
                }
            },
            complete: () => {
                setIsMappingOpen(true);
            }
        });
    };

    const handleUploadConfirm = async () => {
        if (!currentFile || !targetCampaignId) return;
        setUploadingId(targetCampaignId);
        setIsMappingOpen(false);

        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('mapping', JSON.stringify(fieldMapping));

        try {
            const res = await fetch(`https://gibbor-voice-production.up.railway.app/campaigns/${targetCampaignId}/upload`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                alert(data.message || 'Leads uploaded successfully!');
            } else {
                const err = await res.json();
                alert(`Upload failed: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('Error uploading file');
        } finally {
            setUploadingId(null);
            setCurrentFile(null);
            setTargetCampaignId(null);
            setFieldMapping({});
        }
    };

    return (
        <div className="flex-1 bg-white p-8 overflow-y-auto relative">
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

            {/* MAPPING MODAL */}
            {isMappingOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                <FileSpreadsheet className="w-6 h-6 mr-2 text-indigo-600" />
                                Map Columns
                            </h3>
                            <button onClick={() => setIsMappingOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <p className="text-sm text-gray-500 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                Match your CSV columns (Right) to the system fields (Left).
                                <strong> Phone Number is required.</strong>
                            </p>

                            <div className="space-y-4">
                                {SYSTEM_FIELDS.map((field) => (
                                    <div key={field.key} className="flex items-center gap-4">
                                        <div className="w-1/3 text-right">
                                            <label className={`text-sm font-semibold ${field.required ? 'text-indigo-600' : 'text-gray-700'}`}>
                                                {field.label}
                                                {field.required && '*'}
                                            </label>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-300" />
                                        <div className="flex-1">
                                            <select
                                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-gray-800"
                                                title={field.label}
                                                value={fieldMapping[field.key] || ''}
                                                onChange={(e) => setFieldMapping({ ...fieldMapping, [field.key]: e.target.value })}
                                            >
                                                <option value="">-- Select Column --</option>
                                                {csvHeaders.map(h => (
                                                    <option key={h} value={h}>{h}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsMappingOpen(false)}
                                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUploadConfirm}
                                disabled={!fieldMapping['phone']}
                                title={!fieldMapping['phone'] ? 'Please map the Phone Number field' : 'Import Leads'}
                                className={`px-6 py-2 rounded-lg font-bold text-white shadow-md transition-all ${!fieldMapping['phone'] ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5'}`}
                            >
                                Import Leads
                            </button>
                        </div>
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
                                <button
                                    onClick={() => handleDelete(campaign.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                    title="Delete Campaign"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                <label className="cursor-pointer inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors relative">
                                    <Upload className="w-4 h-4 mr-2 text-gray-500" />
                                    {uploadingId === campaign.id ? 'Uploading...' : 'Upload CSV'}
                                    <input
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        disabled={!!uploadingId}
                                        title="Upload CSV"
                                        onClick={(e) => (e.currentTarget.value = '')} // Reset to allow re-selection
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) onFileSelect(campaign.id, e.target.files[0]);
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
