import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";

dotenv.config();

const app = express();
const upload = multer({ dest: '/tmp/uploads/' }); // Use /tmp for Railway

// Ensure upload directory exists
if (!fs.existsSync('/tmp/uploads/')) {
    fs.mkdirSync('/tmp/uploads/', { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Twilio init
const twilioClient = twilio(
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { accountSid: process.env.TWILIO_ACCOUNT_SID }
);

// Supabase init
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

console.log("--- DEBUG CREDENTIALS ---");
console.log("Account SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("API Key:", process.env.TWILIO_API_KEY);
console.log("API Secret (first 5):", process.env.TWILIO_API_SECRET ? process.env.TWILIO_API_SECRET.substring(0, 5) : "MISSING");
console.log("TwiML App SID:", process.env.TWIML_APP_SID);
console.log("-------------------------");

// WebRTC Access Token endpoint
app.get("/token", async (req, res) => {
    try {
        // Usamos una identidad fija para que las llamadas entrantes encuentren al usuario
        // Allow dynamic identity (e.g. for Admin monitoring), fallback to 'agent'
        const identity = req.query.identity || "agent";

        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;

        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: process.env.TWIML_APP_SID,
            incomingAllow: true
        });

        const token = new AccessToken(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_API_KEY,
            process.env.TWILIO_API_SECRET,
            { identity: identity }
        );

        token.addGrant(voiceGrant);

        res.json({
            token: token.toJwt(),
            identity
        });

    } catch (e) {
        console.log(e);
        res.status(500).json({ error: e.message });
    }
});

// Fetch available Twilio numbers (Incoming + Verified Outgoing)
app.get("/phone-numbers", async (req, res) => {
    try {
        const [incoming, verified] = await Promise.all([
            twilioClient.incomingPhoneNumbers.list({ limit: 20 }),
            twilioClient.outgoingCallerIds.list({ limit: 20 })
        ]);

        const mappedIncoming = incoming.map(n => ({
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName,
            type: 'Twilio'
        }));

        const mappedVerified = verified.map(n => ({
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName,
            type: 'Verified'
        }));

        res.json([...mappedIncoming, ...mappedVerified]);
    } catch (e) {
        console.error("Error fetching numbers:", e);
        res.status(500).json({ error: e.message });
    }
});

// Incoming call webhook
app.post("/incoming-call", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    // callerId is passed from frontend device.connect params (renamed to appCallerId to avoid conflict)
    // Twilio custom params can come in body OR query depending on setup
    const body = req.body || {};
    const query = req.query || {};

    const To = body.To || query.To;
    const From = body.From || query.From;
    const CallSid = body.CallSid || query.CallSid;
    const appCallerId = body.appCallerId || query.appCallerId;
    const appUserId = body.appUserId || query.appUserId;

    console.log("Webhook hit. To:", To, "UserID:", appUserId);

    // Determine direction based on caller
    // If From starts with 'client:', it's an outbound call FROM the browser.
    const isClientOutbound = From.startsWith('client:');
    const direction = isClientOutbound ? 'outbound' : 'inbound';

    // Log incoming call to Supabase
    try {
        const payload = {
            from: From,
            to: To,
            direction: direction,
            status: 'ringing',
            sid: CallSid
        };
        if (appUserId) payload.user_id = appUserId;

        await supabase.from('calls').insert(payload);
    } catch (e) {
        console.error("Error logging incoming call:", e);
    }

    const baseUrl = process.env.BASE_URL || 'https://gibbor-voice-production.up.railway.app';
    const outboundCallerId = appCallerId || process.env.TWILIO_PHONE_NUMBER;

    if (To === process.env.TWILIO_PHONE_NUMBER) {
        twiml.say("Conectando con el equipo.");
        const dial = twiml.dial({
            record: 'record-from-ringing',
            recordingStatusCallback: `${baseUrl}/recording-status`,
            recordingStatusCallbackEvent: ['completed'],
            action: `${baseUrl}/call-status`,
            method: 'POST'
        });

        // Backend Simulring: Dial ALL agents found in DB
        // Query Supabase for users. Ideally only those "online" but for now all valid agents.
        const { data: agents } = await supabase.from('profiles').select('email').neq('email', null);

        if (agents && agents.length > 0) {
            console.log(`Simulring to ${agents.length} agents:`, agents.map(a => a.email));
            agents.forEach(agent => {
                if (agent.email) {
                    // Use same identity format as frontend: email
                    dial.client(agent.email);
                }
            });
            // Also add legacy 'agent' just in case? No, move forward.
            // dial.client("agent"); 
        } else {
            console.log("No agents found in DB. Dialing fallback 'agent'.");
            dial.client("agent");
        }
    }
    else if (To === '888888') { // ECHO TEST SERVICE
        console.log("Audio Test Requested (Echo)");
        twiml.say({ voice: 'alice', language: 'es-MX' }, "Prueba de audio Gibbor Voice. Hable después del tono y escuchará su eco.");
        twiml.pause({ length: 1 });
        twiml.echo();
    }
    else if (To) {
        // Outbound calls from browser (TwiML App default URL)
        const dial = twiml.dial({
            callerId: outboundCallerId,
            record: 'record-from-ringing',
            recordingStatusCallback: `${baseUrl}/recording-status`,
            recordingStatusCallbackEvent: ['completed'],
            action: `${baseUrl}/call-status`,
            method: 'POST',
            answerOnBridge: true
        });
        dial.number(To);
    }
    else {
        twiml.say("Bienvenido a Gibbor Voice.");
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

// Generic Call Status Handler
app.post("/call-status", async (req, res) => {
    const { CallSid, CallStatus, CallDuration, DialCallStatus, DialCallDuration, DialCallSid } = req.body;
    console.log(`Call Status Update: ${CallSid} -> ${CallStatus}/${DialCallStatus}`);

    const finalStatus = DialCallStatus || CallStatus;
    const finalDuration = DialCallDuration || CallDuration;

    if (finalStatus && ['completed', 'answered', 'busy', 'no-answer', 'failed', 'canceled'].includes(finalStatus)) {
        try {
            const updateData = { status: finalStatus };
            if (finalDuration) updateData.duration = parseInt(finalDuration);
            if (DialCallSid) updateData.child_sid = DialCallSid; // Link Child SID

            await supabase
                .from('calls')
                .update(updateData)
                .eq('sid', CallSid);
        } catch (e) {
            console.error("Error updating call status:", e);
        }
    }

    const twiml = new twilio.twiml.VoiceResponse();
    res.type("text/xml");
    res.send(twiml.toString());
});

// Recording Status Callback
app.post("/recording-status", async (req, res) => {
    const { CallSid, RecordingUrl, RecordingStatus } = req.body;
    console.log(`Recording ${RecordingStatus}: ${RecordingUrl} for Call ${CallSid}`);
    // Extract .mp3 from .json if needed, or usually RecordingUrl is base. Appending .mp3 makes it playable in browser.
    const audioUrl = RecordingUrl ? `${RecordingUrl}.mp3` : null;

    if (RecordingStatus === 'completed' && audioUrl) {
        try {
            // Match SID OR Child SID
            const { error } = await supabase
                .from('calls')
                .update({ recording_url: audioUrl })
                .or(`sid.eq.${CallSid},child_sid.eq.${CallSid}`);

            if (error) console.error("Error updating recording URL:", error);
        } catch (e) {
            console.error("Error in recording callback:", e);
        }
    }

    res.sendStatus(200);
});

// Send SMS/MMS
app.post("/messages", async (req, res) => {
    try {
        const { to, body, mediaUrl, from } = req.body;

        let sender = from;

        // Smart Reply: If no specific sender provided, try to match the number they texted us at originally
        if (!sender) {
            const { data: lastInbound } = await supabase
                .from('messages')
                .select('to')
                .eq('from', to) // Messages FROM the lead
                .eq('direction', 'inbound')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (lastInbound && lastInbound.to) {
                sender = lastInbound.to;
            }
        }

        // Fallback
        if (!sender) sender = process.env.TWILIO_PHONE_NUMBER;

        // Check if userId is passed (from frontend)
        const userId = req.body.userId || null;


        const messageOptions = {
            body: body,
            from: sender,
            to: to
        };

        if (mediaUrl) {
            messageOptions.mediaUrl = [mediaUrl];
        }

        const message = await twilioClient.messages.create(messageOptions);

        await supabase.from('messages').insert({
            from: sender,
            to: to,
            body: body,
            media_url: mediaUrl || null,
            direction: 'outbound',
            user_id: userId // Save User ID
        });

        res.json(message);
    } catch (e) {
        console.error("Error sending SMS:", e);
        res.status(500).json({ error: e.message });
    }
});

// Incoming SMS/MMS Webhook
app.post("/incoming-message", async (req, res) => {
    const twiml = new twilio.twiml.MessagingResponse();
    const { Body, From, To, NumMedia, MediaUrl0 } = req.body;

    console.log(`New message from ${From}: ${Body}`);
    if (NumMedia > 0) {
        console.log(`Media received: ${MediaUrl0}`);
    }

    // Logic to inherit User ID from previous conversation
    let attachedUserId = null;
    try {
        const { data: lastOutbound } = await supabase
            .from('messages')
            .select('user_id')
            .eq('to', From) // Messages SENT TO this number
            .eq('direction', 'outbound')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastOutbound && lastOutbound.user_id) {
            attachedUserId = lastOutbound.user_id;
            console.log(`Associating incoming message from ${From} with User ${attachedUserId}`);
        }
    } catch (err) {
        console.error("Error finding parent conversation:", err);
    }


    try {
        await supabase.from('messages').insert({
            from: From,
            to: To,
            body: Body,
            body: Body,
            media_url: MediaUrl0 || null,
            direction: 'inbound',
            user_id: attachedUserId
        });
    } catch (e) {
        console.error("Error logging incoming message:", e);
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

// History Endpoints
app.get("/history/calls", async (req, res) => {
    try {
        const { userId, role } = req.query;
        let query = supabase
            .from('calls')
            .select('*')
            .order('created_at', { ascending: false });

        // Isolation Logic:
        if (role === 'admin') {
            // Admin sees all - no filter needed
        } else if (userId) {
            // Agent sees only their own calls
            query = query.eq('user_id', userId);
        } else {
            // Fallback
            query = query.eq('user_id', '00000000-0000-0000-0000-000000000000');
        }

        const { data: calls, error } = await query;
        if (error) throw error;

        // Enrich with Agent Names if Admin
        let enrichedCalls = calls;
        if (role === 'admin' && calls.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, full_name, email');
            const profileMap = {};
            if (profiles) {
                profiles.forEach(p => {
                    profileMap[p.id] = p.full_name || p.email;
                });
            }
            enrichedCalls = calls.map(c => ({
                ...c,
                agent_name: c.user_id ? (profileMap[c.user_id] || 'Unknown Agent') : 'System/Auto'
            }));
        }

        res.json(enrichedCalls);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/history/messages", async (req, res) => {
    try {
        const { userId, role } = req.query;
        let query = supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true });

        // Isolation Logic
        if (role === 'admin') {
            // Admin sees all
        } else if (userId) {
            // Agent sees own messages AND incoming messages assigned to them
            // OR incoming messages that don't have a user_id? (Shared?)
            // Simple version: only matches user_id
            query = query.eq('user_id', userId);
        } else {
            // Safe fallback
            query = query.eq('user_id', '00000000-0000-0000-0000-000000000000');
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reports Endpoint
app.get("/reports", async (req, res) => {
    try {
        const { startDate, endDate, campaignId } = req.query;

        let query = supabase
            .from('calls')
            .select('*');

        // Apply filters
        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);
        // Note: Campaign filtering on calls would require linking calls to leads/campaigns explicitly. 
        // For now, we report on ALL calls or filter by date.

        const { data: calls, error } = await query;
        if (error) throw error;

        // Aggregations
        const total_calls = calls.length;
        const total_duration = calls.reduce((sum, c) => sum + (c.duration || 0), 0);

        // "Connected" implies meaningful conversation. 
        // Twilio statuses: 'completed' usually means answered. 'no-answer', 'busy' are unconnected.
        // We can check if duration > 0 as a proxy for connection if status is ambiguous.
        const connected_calls = calls.filter(c => ['completed', 'answered'].includes(c.status) || (c.duration && c.duration > 0));
        const connected_duration = connected_calls.reduce((sum, c) => sum + (c.duration || 0), 0);

        // Status Breakdown (Lead Disposition?) 
        // NOTE: Calls table stores Twilio call status (completed, busy). 
        // Leads table stores Agent Disposition (Sale, Appointment).
        // Since user wants "Status Chart" usually referring to Outcomes (Cita, Venta), 
        // we might need to query LEADS table too if that's what they mean.
        // BUT user asked for "Call Time", so we start with Calls stats. 
        // Let's ALSO fetch Leads Updated in this timeframe for the Disposition Chart.

        let leadsQuery = supabase.from('leads').select('status, last_call_at, campaign_id');
        if (startDate) leadsQuery = leadsQuery.gte('last_call_at', startDate);
        if (endDate) leadsQuery = leadsQuery.lte('last_call_at', endDate);
        if (campaignId && campaignId !== 'all') leadsQuery = leadsQuery.eq('campaign_id', campaignId);

        const { data: leads, error: leadsError } = await leadsQuery;
        if (leadsError) console.error("Leads report error", leadsError);

        const status_counts = {};
        if (leads) {
            leads.forEach(l => {
                // Handle multi-select? "Cita, Venta". Split and count? Or just count primary?
                // For simplicity, count specific occurrences.
                const statuses = l.status ? l.status.split(',') : ['Unknown'];
                statuses.forEach(s => {
                    const cleanS = s.trim();
                    status_counts[cleanS] = (status_counts[cleanS] || 0) + 1;
                });
            });
        }

        res.json({
            total_calls,
            total_duration,
            connected_duration,
            avg_duration: total_calls > 0 ? Math.round(total_duration / total_calls) : 0,
            status_counts
        });

    } catch (e) {
        console.error("Report error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Advanced Agent Reporting
app.get("/reports/agents", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // Default to today if not provided? Or all time? 
        // User asked for "by days" but typically reports default to today or range.
        // Let's support optional filters.

        const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');

        let sessionQuery = supabase.from('agent_sessions').select('*');
        let callQuery = supabase.from('calls').select('*');

        if (startDate) {
            sessionQuery = sessionQuery.gte('started_at', startDate);
            callQuery = callQuery.gte('created_at', startDate);
        }
        if (endDate) {
            sessionQuery = sessionQuery.lte('started_at', endDate);
            callQuery = callQuery.lte('created_at', endDate);
        }

        const { data: sessions } = await sessionQuery;
        const { data: calls } = await callQuery;

        const report = profiles.map(agent => {
            const agentSessions = sessions ? sessions.filter(s => s.user_id === agent.id) : [];
            const totalOnlineSeconds = agentSessions.reduce((acc, s) => {
                let duration = 0;
                if (s.duration_seconds) {
                    duration = s.duration_seconds;
                } else if (s.started_at) {
                    // Active session or Zombie session
                    // If no valid ended_at, user is still online OR session crashed.
                    // We must calculate duration up to the Report's EndDate (if historical) or Now (if current).

                    const now = new Date();
                    const sessionStart = new Date(s.started_at);

                    // Determine effective end time
                    let effectiveEnd = now;
                    if (endDate) {
                        const queryEnd = new Date(endDate);
                        if (queryEnd < now) {
                            effectiveEnd = queryEnd;
                        }
                    }

                    const diff = Math.floor((effectiveEnd - sessionStart) / 1000);
                    duration = diff > 0 ? diff : 0;
                }
                return acc + duration;
            }, 0);

            const agentCalls = calls ? calls.filter(c => c.user_id === agent.id) : []; // Note: calls might not have user_id populated yet if not updated in other flow
            // Fallback for calls: we need to ensure calls have user_id. 
            // In auto-dialer logic, we didn't insert user_id yet. 
            // FIX: We need to rely on 'agent_sessions' mostly for time. 
            // For calls, we might need to match by something else if user_id is missing? 
            // Or just rely on user_id and assume it will be fixed.

            const totalCalls = agentCalls.length;
            const totalTalkTime = agentCalls.reduce((acc, c) => acc + (c.duration || 0), 0);

            const dispositions = {};
            agentCalls.forEach(c => {
                const d = c.disposition || 'No Status';
                dispositions[d] = (dispositions[d] || 0) + 1;
            });

            return {
                agent_name: agent.full_name || agent.email,
                email: agent.email,
                total_online_seconds: totalOnlineSeconds,
                total_calls: totalCalls,
                total_talk_seconds: totalTalkTime,
                dispositions
            };
        });

        res.json(report);
    } catch (e) {
        console.error("Agent Report Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get("/campaigns", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/campaigns", async (req, res) => {
    try {
        const { name } = req.body;
        const { data, error } = await supabase
            .from('campaigns')
            .insert({ name })
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete("/campaigns/:id", async (req, res) => {
    try {
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/campaigns/:id/upload", upload.single('file'), async (req, res) => {
    const campaignId = req.params.id;
    const results = [];

    // Parse mapping from FormData
    // It comes as a JSON string, e.g. {"phone":"Celular", "name":"Cliente"}
    let mapping = {};
    try {
        if (req.body.mapping) {
            mapping = JSON.parse(req.body.mapping);
        }
    } catch (e) {
        console.error("Error parsing mapping JSON", e);
    }

    // Helper to get value from row using mapping OR fuzzy search
    const getValue = (row, fieldKey, keywords) => {
        // 1. Try explicit mapping
        if (mapping[fieldKey] && row[mapping[fieldKey]] !== undefined) {
            return row[mapping[fieldKey]];
        }
        // 2. Fallback to fuzzy search (Smart Match)
        const foundKey = Object.keys(row).find(k => keywords.some(w => k.toLowerCase().includes(w)));
        return foundKey ? row[foundKey] : null;
    };

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            const leads = results.map(row => {
                const phone = getValue(row, 'phone', ['phone', 'tel', 'cel', 'mobile', 'cell']);
                const name = getValue(row, 'name', ['name', 'nombre', 'cliente']);
                const referred_by = getValue(row, 'referred_by', ['refer', 'ref']);
                const address = getValue(row, 'address', ['address', 'direccion', 'dirección', 'addr']);
                const city = getValue(row, 'city', ['city', 'ciudad', 'town']);
                const general_info = getValue(row, 'general_info', ['info', 'desc']);
                const rep_notes = getValue(row, 'rep_notes', ['rep', 'representante']);
                const tlmk_notes = getValue(row, 'tlmk_notes', ['tlmk', 'telemarketing']);
                const notes = getValue(row, 'notes', ['note', 'nota', 'comment', 'comentario']);

                return {
                    campaign_id: campaignId,
                    phone: phone,
                    name: name,
                    referred_by: referred_by,
                    address: address,
                    city: city,
                    general_info: general_info,
                    rep_notes: rep_notes,
                    tlmk_notes: tlmk_notes,
                    notes: notes,
                    status: 'pending'
                };
            }).filter(l => l.phone);

            if (leads.length > 0) {
                const { error } = await supabase.from('leads').insert(leads);
                if (error) console.error("Error inserting leads", error);
            }
            fs.unlinkSync(req.file.path);
            res.json({ message: `Uploaded ${leads.length} leads` });
        });
});

app.get("/campaigns/:id/next-lead", async (req, res) => {
    try {
        const { exclude_id } = req.query;
        console.log(`GET /next-lead campaign=${req.params.id} exclude=${exclude_id}`);

        let query = supabase
            .from('leads')
            .select('*')
            .eq('campaign_id', req.params.id)
            .eq('status', 'pending');

        // Support multiple excluded IDs (comma separated or single)
        if (exclude_id) {
            const ids = exclude_id.split(',');
            query = query.not('id', 'in', `(${ids.join(',')})`);
        }

        const { data, error } = await query
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.json(null);
        res.json(data);
    } catch (e) {
        console.error("Error fetching next lead:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/leads/:id/update", async (req, res) => {
    try {
        console.log(`POST /leads/${req.params.id}/update called`, req.body);
        const { status, notes } = req.body;

        // Fix: Use last_call_at instead of updated_at (column doesn't exist)
        const updateData = { status, last_call_at: new Date() };
        if (notes) updateData.notes = notes;

        const { error } = await supabase
            .from('leads')
            .update(updateData)
            .eq('id', req.params.id);

        if (error) {
            console.error("Supabase update error:", error);
            throw error;
        }
        console.log("Update success for", req.params.id, updateData);
        res.json({ success: true });
    } catch (e) {
        console.error("Endpoint error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Auto Dialer Endpoints
app.post("/auto-dialer/start", async (req, res) => {
    try {
        const { campaignId, callerId } = req.body;
        console.log(`Starting Auto Dialer for Campaign: ${campaignId}, Caller: ${callerId}`);

        // 1. Fetch 3 pending leads ATOMICALLY (using RPC)
        const { data: leads, error } = await supabase
            .rpc('get_next_leads', {
                p_campaign_id: campaignId,
                p_limit: 3
            });

        if (error) {
            console.error("RPC Error:", error);
            throw error;
        }

        if (!leads || leads.length === 0) return res.json({ message: "No pending leads found", leads: [] });

        const baseUrl = process.env.BASE_URL || 'https://gibbor-voice-production.up.railway.app';
        const calls = [];

        // 2. Dial each lead
        for (const lead of leads) {
            const call = await twilioClient.calls.create({
                url: `${baseUrl}/auto-dialer/connect?leadId=${lead.id}`, // Pass Lead ID
                to: lead.phone,
                from: callerId || process.env.TWILIO_PHONE_NUMBER,
                machineDetection: 'Enable', // AMD
                statusCallback: `${baseUrl}/auto-dialer/status`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
            });
            calls.push({ ...lead, callSid: call.sid });

            // LOGGING: Insert into 'calls' table so Monitor can see it
            // We don't have user_id (agent) yet, so maybe leave null or system id?
            // Or we assume 'client:agent' belongs to a specific user? 
            // For now, let's insert with null user_id, or if we passed userId from frontend (which we didn't).
            await supabase.from('calls').insert({
                sid: call.sid,
                direction: 'outbound',
                status: 'dialing',
                recipient: lead.phone,
                // lead_id: lead.id, // Column doesn't exist yet, stored in context manually if needed
                created_at: new Date()
            });
        }

        res.json({ message: "Dialing initiated", leads: calls });

    } catch (e) {
        console.error("Auto Dialer Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Connected Webhook (Lead Answered) -> Bridge to Agent
// Connected Webhook (Lead Answered) -> Bridge to Agent via Conference
app.post("/auto-dialer/connect", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const { leadId } = req.query;
    const { AnsweredBy, CallSid } = req.body;
    const baseUrl = process.env.BASE_URL || 'https://gibbor-voice-production.up.railway.app';

    console.log(`Auto Dialer: Connect Request for Lead ${leadId}, AnsweredBy: ${AnsweredBy}`);

    // AMD Logic: Hangup if machine
    if (AnsweredBy && (AnsweredBy.startsWith('machine') || AnsweredBy === 'fax')) {
        console.log(`Machine detected (${AnsweredBy}). Hanging up.`);
        twiml.hangup();
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }

    const roomName = `room_${CallSid}`; // Unique room per lead call

    // 1. Put Lead in Conference
    const dial = twiml.dial();
    dial.conference({
        startConferenceOnEnter: true,
        endConferenceOnExit: true, // End conf when Lead hangs up? Or Agent? Better to let Agent hangup end it? 
        // If Lead hangs up, agent is alone. 
        // If Agent hangs up, lead hangs up? 
        // Let's stick to true for now so it cleans up.
    }, roomName);

    // 2. Dial Agent to Join Conference
    try {
        await twilioClient.calls.create({
            to: 'client:agent', // Fixed identity for now
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${baseUrl}/auto-dialer/join-agent?room=${roomName}`,
        });
        console.log(`Auto Dialer: Dialing Agent to join ${roomName}`);
    } catch (e) {
        console.error("Error dialing agent:", e);
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// Endpoint for Agent to Join Conference
app.post("/auto-dialer/join-agent", (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const { room } = req.query;

    console.log(`Agent joining conference: ${room}`);

    const dial = twiml.dial();
    dial.conference({
        startConferenceOnEnter: true,
        endConferenceOnExit: true // If agent leaves, end call?
    }, room);

    res.type('text/xml');
    res.send(twiml.toString());
});

// Heartbeat Endpoint: Updates duration_seconds for the active session
app.post("/heartbeat", async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "Missing userId" });

        // Find the most recent open session for this user
        const { data: session, error: findError } = await supabase
            .from('agent_sessions')
            .select('*')
            .eq('user_id', userId)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .single();

        if (findError && findError.code !== 'PGRST116') { // PGRST116 is "No rows found"
            console.error("Heartbeat find error:", findError);
            return res.status(500).json({ error: findError.message });
        }

        if (session) {
            // Update duration_seconds
            const now = new Date();
            const start = new Date(session.started_at);
            const duration = Math.floor((now - start) / 1000);

            const { error: updateError } = await supabase
                .from('agent_sessions')
                .update({ duration_seconds: duration })
                .eq('id', session.id);

            if (updateError) throw updateError;
            res.json({ success: true, duration });
        } else {
            // No open session? Maybe create one or just ignore. 
            // For now, ignore to avoid ghostly sessions.
            res.json({ success: false, message: "No active session found" });
        }
    } catch (e) {
        console.error("Heartbeat error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: List Users (Bypass RLS) + Metrics
app.get("/users", async (req, res) => {
    try {
        // 1. Get Profiles
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 2. Enrich with Today's Stats (Venezuela Timezone: UTC-4)
        // Midnight in VZ is 04:00:00 UTC
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Caracas',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(new Date());
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;

        // VZ Midnight is 04:00 UTC of the same day (since offset is -04:00)
        const todayISO = `${year}-${month}-${day}T04:00:00.000Z`;

        const enrichedProfiles = await Promise.all(profiles.map(async (user) => {
            // A. Count Calls Today
            const { count: callsToday } = await supabase
                .from('calls') // Ensure this table exists and has user_id
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('created_at', todayISO);

            // B. Calculate Online Time Today (Seconds) with Interval Merging
            const { data: sessions } = await supabase
                .from('agent_sessions')
                .select('*')
                .eq('user_id', user.id)
                .gte('started_at', todayISO);

            let secondsOnline = 0;
            let firstLoginTime = null;
            let lastSeen = null;
            let secondsOffline = 0;

            if (sessions && sessions.length > 0) {
                // 1. Calculate Seconds Online
                secondsOnline = sessions.reduce((acc, s) => {
                    let duration = 0;
                    if (s.duration_seconds) {
                        duration = s.duration_seconds;
                    } else if (s.ended_at) {
                        duration = (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000;
                    } else {
                        duration = 0;
                    }
                    return acc + duration;
                }, 0);
                // C. Get First Login Today (Separate Query for accuracy)
                const { data: firstSession } = await supabase
                    .from('agent_sessions')
                    .select('started_at')
                    .eq('user_id', user.id)
                    .gte('started_at', todayISO)
                    .order('started_at', { ascending: true })
                    .limit(1)
                    .single();

                firstLoginTime = firstSession ? firstSession.started_at : null;

                // D. Get Last Seen (Global - Most recent session)
                const { data: lastSessionGlobal } = await supabase
                    .from('agent_sessions')
                    .select('started_at, ended_at')
                    .eq('user_id', user.id)
                    .order('started_at', { ascending: false })
                    .limit(1)
                    .single();

                if (lastSessionGlobal) {
                    // If ended_at is null, they are currently online => Last seen is "Now"
                    // If ended_at is present, that's when they left.
                    lastSeen = lastSessionGlobal.ended_at ? lastSessionGlobal.ended_at : new Date().toISOString();
                }

                // E. Calculate Time Offline
                if (firstLoginTime) {
                    const now = new Date();
                    const totalTimeSinceFirstLogin = (now - new Date(firstLoginTime)) / 1000;
                    secondsOffline = Math.max(0, totalTimeSinceFirstLogin - secondsOnline);
                }

            }

            return {
                ...user,
                stats: {
                    callsToday: callsToday || 0,
                    secondsOnline: Math.floor(secondsOnline),
                    secondsOffline: Math.floor(secondsOffline),
                    lastLogin: firstLoginTime,
                    lastSeen: lastSeen
                }
            };
        }));

        res.json(enrichedProfiles);
    } catch (e) {
        console.error("Error fetching users metrics:", e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Create Agent Endpoint
app.post("/agents", async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        console.log(`Creating agent: ${email}`);

        // 1. Create Auth User
        const { data: user, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true // Auto-confirm
        });

        if (authError) throw authError;

        // 2. Create Profile (Trigger might handle this, but let's be explicit/safe)
        // Check if profile exists first (handling race condition with trigger)
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.user.id)
            .single();

        if (!existingProfile) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: user.user.id,
                    email: email,
                    full_name: fullName,
                    role: 'agent'
                });
            if (profileError) console.error("Profile creation error (might be handled by trigger):", profileError);
        } else {
            // Update name if trigger created it empty
            await supabase
                .from('profiles')
                .update({ full_name: fullName, role: 'agent' })
                .eq('id', user.user.id);
        }

        res.json({ message: "Agent created successfully", user: user.user });

    } catch (e) {
        console.error("Error creating agent:", e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Delete Agent Endpoint
app.delete("/agents/:id", async (req, res) => {
    try {
        const userId = req.params.id;
        console.log(`Deleting agent: ${userId}`);

        // 1. Delete from Auth (This invalidates session)
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) throw authError;

        // 2. Cascade delete from Profiles/etc is usually handled by DB Foreign Keys (ON DELETE CASCADE)
        // If not, we might need to manually clean up 'profiles', 'agent_sessions', etc.
        // Assuming Supabase RLS policies and FKs handle this or allow orphans. 
        // Best practice: Delete profile manually if no Cascade.
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileError) console.error("Error deleting profile (might be cascaded):", profileError);

        res.json({ message: "Agent deleted successfully" });
    } catch (e) {
        console.error("Error deleting agent:", e);
        res.status(500).json({ error: e.message });
    }
});

// Auto Dialer Status Callback (Optional for now, good for debugging)
app.post("/auto-dialer/status", (req, res) => {
    const { CallSid, CallStatus, AnsweredBy } = req.body;
    console.log(`Auto Dialer Status: ${CallSid} is ${CallStatus}. AnsweredBy: ${AnsweredBy}`);
    res.sendStatus(200);
});

// Health check
app.get("/", (req, res) => {
    console.log("Health check hit! - Force Update");
    res.send("Gibbor Voice Backend is running!");
});
// Helper to get Twilio Numbers
app.get('/incoming-phone-numbers', async (req, res) => {
    try {
        const incoming = await twilioClient.incomingPhoneNumbers.list({ limit: 20 });
        const formattedIncoming = incoming.map(n => ({
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName,
            type: 'Twilio'
        }));

        const verified = await twilioClient.outgoingCallerIds.list({ limit: 20 });
        const formattedVerified = verified.map(n => ({
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName,
            type: 'Verified'
        }));

        res.json([...formattedIncoming, ...formattedVerified]);
    } catch (e) {
        console.error("Error fetching numbers", e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    const address = server.address();
    console.log("Backend running on port", PORT);
    console.log("Server address info:", address);
});
