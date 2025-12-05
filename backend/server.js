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
        const identity = `agent_${Math.floor(Math.random() * 9999)}`;

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
    const { To } = req.body;

    console.log("Webhook hit. To:", To);

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
