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
        console.log(`Generating Token for Identity: ${identity}`);

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
            { identity: identity, ttl: 86400 } // 24 Hour Token TTL
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
        const { userId } = req.query;

        // 1. Fetch All Available Numbers from Twilio (Base Source of Truth)
        // 1. Fetch All Available Numbers from Twilio (Base Source of Truth)
        let allTwilioNumbers = [];
        try {
            const [incoming, verified] = await Promise.all([
                twilioClient.incomingPhoneNumbers.list({ limit: 100 }), // Increased limit
                twilioClient.outgoingCallerIds.list({ limit: 100 })
            ]);

            allTwilioNumbers = [
                ...incoming.map(n => ({
                    phoneNumber: n.phoneNumber,
                    friendlyName: n.friendlyName,
                    type: 'Twilio'
                })),
                ...verified.map(n => ({
                    phoneNumber: n.phoneNumber,
                    friendlyName: n.friendlyName,
                    type: 'Verified'
                }))
            ];
        } catch (twilioError) {
            console.error("Twilio API Error (Non-critical):", twilioError.message);
            // Proceed with empty list - local DB numbers will be used as fallback
        }

        let finalNumbers = allTwilioNumbers;
        let callbackNumber = null;

        if (userId) {
            // Fetch User Profile with Zone Info
            const { data: profile } = await supabase
                .from('profiles')
                .select(`
                    id, 
                    role, 
                    zone_id,
                    zones (
                        id,
                        name,
                        callback_number,
                        zone_numbers (phone_number)
                    )
                `)
                .eq('id', userId)
                .single();

            if (profile) {
                // ADMIN: Sees ALL Twilio Numbers
                if (profile.role === 'admin') {
                    // No filtering needed
                }
                // AGENT: Sees ONLY Zone Numbers
                else if (profile.zone_id && profile.zones) {
                    const zoneNumbers = profile.zones.zone_numbers.map(zn => zn.phone_number);

                    // Filter Twilio numbers that are in the Zone OR use DB numbers if not found in fetch
                    // This ensures even if Twilio pagination misses it, we still show the number
                    finalNumbers = zoneNumbers.map(zNum => {
                        const twilioMatch = allTwilioNumbers.find(t => t.phoneNumber === zNum);
                        return twilioMatch || { phoneNumber: zNum, friendlyName: '', type: 'Twilio' };
                    });

                    // Set Zone Callback Number
                    callbackNumber = profile.zones.callback_number;

                    console.log(`[UserId: ${userId}] Zone: ${profile.zones.name}, Numbers: ${finalNumbers.length}`);
                }
                // FALLBACK: User has no zone? Return empty or default
                else {
                    finalNumbers = [];
                }
            }
        }

        res.json({
            numbers: finalNumbers,
            callbackNumber: callbackNumber
        });
    } catch (e) {
        console.error("Error fetching numbers:", e);
        res.status(500).json({ error: e.message });
    }
});


// DEBUG ENDPOINT: Check User Profile & Zone Data
app.get("/debug/user/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`
                *,
                zones (
                    *,
                    zone_numbers (*)
                )
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json(profile);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Agent Numbers (Admin Only)
app.put("/agents/:id/numbers", async (req, res) => {
    try {
        const { assigned_caller_ids, callback_number } = req.body;
        console.log(`Updating numbers for agent ${req.params.id}`, { assigned_caller_ids, callback_number });

        const { error } = await supabase
            .from('profiles')
            .update({
                assigned_caller_ids,
                callback_number
            })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error("Error updating agent numbers:", e);
        res.status(500).json({ error: e.message });
    }
});

// Incoming call webhook
app.post("/incoming-call", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const body = req.body || {};
    const query = req.query || {};

    const To = body.To || query.To;
    const From = body.From || query.From;
    const CallSid = body.CallSid || query.CallSid;
    // appCallerId passed from frontend for outbound calls
    const appCallerId = body.appCallerId || query.appCallerId;
    const appUserId = body.appUserId || query.appUserId;

    console.log(`Webhook hit. From: ${From} -> To: ${To} | UserID: ${appUserId}`);

    const isClientOutbound = From && From.startsWith('client:');
    const baseUrl = process.env.BASE_URL || 'https://gibbor-voice-production.up.railway.app';
    const outboundCallerId = appCallerId || process.env.TWILIO_PHONE_NUMBER;

    if (isClientOutbound) {
        // --- OUTBOUND CALL LOGIC (Agent Calling Customer) ---
        console.log("Direction: Outbound");

        // Log to DB
        try {
            await supabase.from('calls').insert({
                from: From,
                to: To,
                direction: 'outbound',
                status: 'ringing',
                sid: CallSid,
                user_id: appUserId,
                caller_number: outboundCallerId
            });
        } catch (e) { console.error("Log Outbound Error", e); }

        if (To === '888888') {
            // Echo Test
            console.log("Audio Test Requested");
            twiml.say({ voice: 'alice', language: 'es-MX' }, "Prueba de audio. Hable después del tono.");
            twiml.echo();
        } else if (To) {
            // E.164 Normalization for Voice
            let formattedTo = To.replace(/\D/g, '');
            if (formattedTo.length === 10) {
                formattedTo = `+1${formattedTo}`;
            } else if (formattedTo.length > 10 && !To.startsWith('+')) {
                formattedTo = `+${formattedTo}`;
            } else if (To.startsWith('+')) {
                formattedTo = To;
            }

            console.log(`Dialing Outbound: ${formattedTo} (Original: ${To}) via ${outboundCallerId}`);

            const dial = twiml.dial({
                callerId: outboundCallerId,
                record: 'record-from-ringing',
                recordingStatusCallback: `${baseUrl}/recording-status`,
                recordingStatusCallbackEvent: ['completed'],
                action: `${baseUrl}/call-status`,
                method: 'POST',
                answerOnBridge: true
            });
            dial.number(formattedTo);
        } else {
            twiml.say("Número inválido.");
        }

    } else {
        // --- INBOUND CALL LOGIC (Customer Calling Back) ---
        console.log("Direction: Inbound (Potential Smart Routing)");

        // Log to DB
        try {
            await supabase.from('calls').insert({
                from: From,
                to: To,
                direction: 'inbound',
                status: 'ringing',
                sid: CallSid
            });
        } catch (e) { console.error("Log Inbound Error", e); }

        // Smart Routing (Sticky Routing)
        try {
            // Logic: Find the last agent who called THIS customer (From) using THIS number (To) via outbound.
            const { data: lastCall } = await supabase
                .from('calls')
                .select('user_id')
                .eq('to', From) // Who we called (Customer)
                .eq('direction', 'outbound')
                .eq('caller_number', To) // CRITICAL: The number we used to call them must match the number they are calling back
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            let targetClients = [];

            // 1. Priority: Sticky Agent (Last person who called THIS customer using THIS number)
            if (lastCall && lastCall.user_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, email')
                    .eq('id', lastCall.user_id)
                    .single();

                if (profile) {
                    const identity = profile.email || `user_${profile.id}`;
                    targetClients.push(identity);
                    console.log(`Routing: Sticky to ${identity}`);
                }
            }

            // 2. Fallback: Zone Simulring (Ring all agents in the Zone owning this number)
            if (targetClients.length === 0) {
                // Find which zone owns this number 'To'
                const { data: zoneNum } = await supabase
                    .from('zone_numbers')
                    .select('zone_id')
                    .eq('phone_number', To)
                    .single();

                if (zoneNum && zoneNum.zone_id) {
                    // Get all agents in this zone
                    const { data: agents } = await supabase
                        .from('profiles')
                        .select('id, email')
                        .eq('zone_id', zoneNum.zone_id);

                    if (agents && agents.length > 0) {
                        targetClients = agents.map(a => a.email || `user_${a.id}`);
                        console.log(`Routing: Zone Simulring to [${targetClients.join(', ')}]`);
                    }
                }
            }

            // 3. Ultimate Fallback: Admin
            if (targetClients.length === 0) {
                targetClients.push('admin@gibborcenter.com');
                console.log(`Routing: Fallback to Admin`);
            }

            const dial = twiml.dial({
                callerId: From,
                timeout: 60,
                answerOnBridge: true
            });

            // Ring everyone identified
            targetClients.forEach(client => dial.client(client));

            // Fallback: If agent doesn't answer (Dial ends), take a message
            twiml.say({ voice: 'alice', language: 'es-MX' }, "El agente no está disponible en este momento. Por favor deje un mensaje después del tono.");
            twiml.record({
                action: `${baseUrl}/recording-status`,
                transcribe: false,
                playBeep: true
            });

        } catch (err) {
            console.error("Smart Routing Error:", err);
            // Fallback
            const dial = twiml.dial();
            dial.client('admin@gibborcenter.com');
        }
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

            // Fetch Quality Metrics (MOS) if completed
            if (finalStatus === 'completed') {
                // Wait for Voice Insights to be ready (approx 5-10s delay usually needed for full summary)
                setTimeout(async () => {
                    try {
                        // Note: Requires Voice Insights enabled on Twilio Console
                        const summary = await twilioClient.insights.v1.calls(CallSid).summary().fetch();
                        if (summary && summary.qualityScore) {
                            console.log(`Call Quality (MOS) for ${CallSid}: ${summary.qualityScore}`);
                            await supabase
                                .from('calls')
                                .update({
                                    quality_score: summary.qualityScore,
                                    // If MOS < 3.5, flag network warning
                                    network_warning: summary.qualityScore < 3.5
                                })
                                .eq('sid', CallSid);
                        }
                    } catch (err) {
                        // Suppress error if insights not available immediately
                        // console.log("Insights fetch/update skipped:", err.message);
                    }
                }, 10000); // 10s delay
            }

            await supabase
                .from('calls')
                .update(updateData)
                .eq('sid', CallSid);
        } catch (e) {
            console.error("Error updating call status:", e);
        }
    }

    // Metric persistence endpoint from Client
    app.post("/calls/:sid/metrics", async (req, res) => {
        const { sid } = req.params;
        const { mos, jitter, rtt, hangup_source } = req.body;
        console.log(`Received Client Metrics for ${sid}: MOS=${mos}, Jitter=${jitter}, RTT=${rtt}, HangupSource=${hangup_source}`);

        try {
            const { error } = await supabase
                .from('calls')
                .update({
                    mos_client: mos,
                    jitter_client: jitter,
                    rtt_client: rtt,
                    hangup_source: hangup_source,
                    network_warning: mos < 3.5
                })
                .eq('sid', sid);

            if (error) {
                // If columns don't exist, this might fail. We log but don't crash.
                console.error("Error updating metrics (Columns might be missing):", error.message);
            }
        } catch (e) {
            console.error("Metrics update exception:", e.message);
        }
        res.sendStatus(200);
    });

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
        // Check if userId is passed (from frontend)
        const userId = req.body.userId || null;

        // Normalization (E.164 for US)
        let formattedTo = to.replace(/\D/g, ''); // Remove non-digits
        if (formattedTo.length === 10) {
            formattedTo = `+1${formattedTo}`;
        } else if (formattedTo.length > 10 && !to.startsWith('+')) {
            formattedTo = `+${formattedTo}`;
        } else if (to.startsWith('+')) {
            formattedTo = to; // Keep as is if already has +
        }

        const messageOptions = {
            body: body,
            from: sender,
            to: formattedTo
        };

        if (mediaUrl) {
            messageOptions.mediaUrl = [mediaUrl];
        }

        const message = await twilioClient.messages.create(messageOptions);

        await supabase.from('messages').insert({
            from: sender,
            to: formattedTo,
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
        const cleanFrom = From.replace('+1', ''); // US specific matching

        const { data: lastOutbound } = await supabase
            .from('messages')
            .select('user_id')
            .or(`to.eq.${From},to.eq.${cleanFrom}`) // Match +1845... OR 845...
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


// Admin: List Users (Bypass RLS) + Metrics
app.get("/users", async (req, res) => {
    try {
        // 1. Get Profiles
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*') // Includes zone_id
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

            // NEW LOGIC: Fetch Last Call Timestamp
            const { data: lastCall } = await supabase
                .from('calls')
                .select('created_at')
                .or(`user_id.eq.${user.id},from.eq.${user.email},to.eq.${user.email}`) // Check ID or Email for robust matching
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            // Presence fields removed as requested


            return {
                ...user,
                stats: {
                    callsToday: callsToday || 0,
                    lastCall: lastCall?.created_at || null

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

        // 1. Unlink dependencies (Calls & Messages) to avoid FK Constraint errors
        // We set user_id to NULL to preserve the history of the calls/messages
        const { error: callsError } = await supabase
            .from('calls')
            .update({ user_id: null })
            .eq('user_id', userId);
        if (callsError) console.error("Error unlinking calls:", callsError);

        const { error: msgsError } = await supabase
            .from('messages')
            .update({ user_id: null })
            .eq('user_id', userId);
        if (msgsError) console.error("Error unlinking messages:", msgsError);

        // 2. Proactively cleanup agent_sessions if they exist
        // This avoids errors if the table still exists and references the user
        try {
            const { error: sessionError } = await supabase
                .from('agent_sessions')
                .delete()
                .eq('user_id', userId);
            if (sessionError && !sessionError.message.includes('not found')) {
                console.error("Error deleting sessions:", sessionError);
            }
        } catch (sessionEx) {
            // Table might not exist, that's fine
            console.log("agent_sessions table likely gone or error:", sessionEx.message);
        }

        // 3. Delete from Profiles first (if it references Auth)
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileError) {
            console.error("Error deleting profile:", profileError);
            // We don't throw here yet, try to delete from Auth anyway
        }

        // 4. Delete from Auth (Final step)
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
            console.error("Error deleting from auth:", authError);
            throw new Error(`Auth cleanup failed: ${authError.message}`);
        }

        res.json({ message: "Agent deleted successfully" });
    } catch (e) {
        console.error("Error deleting agent:", e);
        res.status(500).json({ error: e.message });
    }
});

// Auto Dialer Status Callback (Optional for now, good for debugging)
// [REMOVED] Auto Dialer Status Callback

// Health check
app.get("/", (req, res) => {
    console.log("Health check hit! - Force Update");
    res.send("Gibbor Voice Backend is running!");
});


const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    const address = server.address();
    console.log("Backend running on port", PORT);
    console.log("Server address info:", address);
});
// --- ZONE MANAGEMENT ENDPOINTS ---

// GET /zones - List all zones and their number counts
app.get("/zones", async (req, res) => {
    try {
        const { data: zones, error } = await supabase
            .from('zones')
            .select(`
                *,
                zone_numbers (count)
            `);
        if (error) throw error;
        // Transform for easier frontend consumption
        const formatted = zones.map(z => ({
            ...z,
            numberCount: z.zone_numbers[0]?.count || 0
        }));
        res.json(formatted);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /zones - Create a new zone
app.post("/zones", async (req, res) => {
    try {
        const { name, callback_number } = req.body;
        const { data, error } = await supabase
            .from('zones')
            .insert({ name, callback_number })
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /zones/:id/numbers - Add numbers to a zone
app.post("/zones/:id/numbers", async (req, res) => {
    try {
        const { id } = req.params;
        const { numbers } = req.body; // Array of phone numbers (strings)

        if (!numbers || !Array.isArray(numbers)) throw new Error("Invalid numbers array");

        const inserts = numbers.map(num => ({
            zone_id: id,
            phone_number: num
        }));

        const { error } = await supabase
            .from('zone_numbers')
            .insert(inserts);

        if (error) throw error;
        res.json({ success: true, count: numbers.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /zones/:id/numbers - Remove numbers from a zone
app.delete("/zones/:id/numbers", async (req, res) => {
    try {
        const { id } = req.params;
        const { numbers } = req.body; // Array of numbers to remove

        const { error } = await supabase
            .from('zone_numbers')
            .delete()
            .eq('zone_id', id)
            .in('phone_number', numbers);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /zones/:id - Update zone details (name, callback_number)
app.put("/zones/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, callback_number } = req.body;

        const { error } = await supabase
            .from('zones')
            .update({ name, callback_number })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /zones/:id - Delete a zone
app.delete("/zones/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Unassign users from this zone (optional, but good practice if no cascade)
        await supabase.from('profiles').update({ zone_id: null }).eq('zone_id', id);

        // 2. Delete Zone Numbers (Cascade usually handles this, but let's be safe)
        await supabase.from('zone_numbers').delete().eq('zone_id', id);

        // 3. Delete Zone
        const { error } = await supabase
            .from('zones')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /users/:id/zone - Assign a zone to a user
app.put("/users/:id/zone", async (req, res) => {
    try {
        const { id } = req.params;
        const { zone_id } = req.body; // Can be null to unassign

        const { error } = await supabase
            .from('profiles')
            .update({ zone_id })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error("Error assigning zone:", e);
        res.status(500).json({ error: e.message });
    }
});
