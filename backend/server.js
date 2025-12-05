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

    console.log("Webhook hit. To:", To);

    // Log incoming call to Supabase
    try {
        await supabase.from('calls').insert({
            from: From,
            to: To,
            direction: 'inbound',
            status: 'ringing'
        });
    } catch (e) {
        console.error("Error logging incoming call:", e);
    }

    // Si el número de destino es el mismo que el de Twilio, es una llamada entrante -> Conectar al navegador
    if (To === process.env.TWILIO_PHONE_NUMBER) {
        twiml.say("Conectando con el agente.");
        // Nota: Para recibir llamadas, el cliente debe tener esta identidad exacta.
        // Por ahora, usaremos una identidad fija o la que el frontend use.
        twiml.dial().client("agent");
    }
    // Si hay un número "To" y NO es el de Twilio, es una llamada saliente desde el navegador
    else if (To) {
        twiml.dial({ callerId: process.env.TWILIO_PHONE_NUMBER }).number(To);
    }
    else {
        twiml.say("Bienvenido a Gibbor Voice.");
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

// Outbound calls
app.post("/call", async (req, res) => {
    try {
        const { to } = req.body;

        const call = await twilioClient.calls.create({
            url: `${process.env.BASE_URL}/outbound-twiml`,
            to,
            from: process.env.TWILIO_PHONE_NUMBER
        });

        // Log outbound call to Supabase
        await supabase.from('calls').insert({
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to,
            direction: 'outbound',
            status: 'initiated'
        });

        res.json(call);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Outbound TWIML
app.post("/outbound-twiml", (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Realizando llamada desde Gibbor Voice.");
    twiml.dial(req.body.To);

    res.type("text/xml");
    res.send(twiml.toString());
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

        // Log outbound message to Supabase
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

    // Log incoming message to Supabase
    try {
        await supabase.from('messages').insert({
            from: From,
            to: To,
            body: Body,
            media_url: MediaUrl0 || null, // Store first media attachment if exists
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
console.log("Process Env PORT:", process.env.PORT);
const server = app.listen(PORT, () => {
    const address = server.address();
    console.log("Backend running on port", PORT);
    console.log("Server address info:", address);
});
