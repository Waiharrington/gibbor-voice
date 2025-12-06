import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
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

// Incoming call webhook
app.post("/incoming-call", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const { To, From, CallSid } = req.body;

    console.log("Webhook hit. To:", To, "CallSid:", CallSid);

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
            callerId: process.env.TWILIO_PHONE_NUMBER,
            record: 'record-from-ringing',
            recordingStatusCallback: `${baseUrl}/recording-status`,
            recordingStatusCallbackEvent: ['completed'],
            action: `${baseUrl}/call-status`,
            method: 'POST'
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

// Health check
app.get("/", (req, res) => {
    console.log("Health check hit!");
    res.send("Gibbor Voice Backend is running!");
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    const address = server.address();
    console.log("Backend running on port", PORT);
    console.log("Server address info:", address);
});
