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
        const identity = "agent";

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
    const { To, From, CallSid, appCallerId } = req.body;

    console.log("Webhook hit. To:", To, "CallSid:", CallSid, "Custom CallerId:", appCallerId);

    // Determine direction based on caller
    // If From starts with 'client:', it's an outbound call FROM the browser.
    const isClientOutbound = From.startsWith('client:');
    const direction = isClientOutbound ? 'outbound' : 'inbound';

    // Log incoming call to Supabase
    try {
        await supabase.from('calls').insert({
            from: From,
            to: To,
            direction: direction,
            status: 'ringing',
            sid: CallSid
        });
    } catch (e) {
        console.error("Error logging incoming call:", e);
    }

    const baseUrl = process.env.BASE_URL || 'https://gibbor-voice-production.up.railway.app';
    const outboundCallerId = appCallerId || process.env.TWILIO_PHONE_NUMBER;

    if (To === process.env.TWILIO_PHONE_NUMBER) {
        twiml.say("Conectando con el agente.");
        const dial = twiml.dial({
            record: 'record-from-ringing',
            recordingStatusCallback: `${baseUrl}/recording-status`,
            recordingStatusCallbackEvent: ['completed'],
            action: `${baseUrl}/call-status`,
            method: 'POST'
        });
        dial.client("agent");
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
        const { to, body, mediaUrl } = req.body;

        const messageOptions = {
            body: body,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to
        };

        if (mediaUrl) {
            messageOptions.mediaUrl = [mediaUrl];
        }

        const message = await twilioClient.messages.create(messageOptions);

        await supabase.from('messages').insert({
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to,
            body: body,
            media_url: mediaUrl || null,
            direction: 'outbound'
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

    try {
        await supabase.from('messages').insert({
            from: From,
            to: To,
            body: Body,
            media_url: MediaUrl0 || null,
            direction: 'inbound'
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
        const { data, error } = await supabase
            .from('calls')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/history/messages", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true }); // Chat order

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
        const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
        const { data: sessions } = await supabase.from('agent_sessions').select('*');
        const { data: calls } = await supabase.from('calls').select('*');

        const report = profiles.map(agent => {
            const agentSessions = sessions ? sessions.filter(s => s.user_id === agent.id) : [];
            const totalOnlineSeconds = agentSessions.reduce((acc, s) => {
                if (s.duration_seconds) return acc + s.duration_seconds;
                if (s.started_at && !s.ended_at) {
                    const diff = Math.floor((new Date() - new Date(s.started_at)) / 1000);
                    return acc + (diff > 0 ? diff : 0);
                }
                return acc;
            }, 0);

            const agentCalls = calls ? calls.filter(c => c.user_id === agent.id) : [];
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
