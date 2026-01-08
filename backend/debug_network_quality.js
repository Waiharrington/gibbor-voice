
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const twilioClient = twilio(process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET, { accountSid: process.env.TWILIO_ACCOUNT_SID });

async function checkCall() {
    console.log("Searching for call with number: 3232729735...");

    // 1. Search in Supabase
    // Using ILIKE with wildcards to catch +1 or no prefix
    const { data: calls, error } = await supabase
        .from('calls')
        .select('*')
        .or('from.ilike.%3232729735%,to.ilike.%3232729735%')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Supabase Error:", error);
        return;
    }

    if (!calls || calls.length === 0) {
        console.log("No calls found in Supabase for this number.");
        return;
    }

    console.log(`Found ${calls.length} calls. Checking the most recent one...`);

    // Check the most recent one
    const call = calls[0];
    console.log("\n--- CALL DETAILS (Supabase) ---");
    console.log(`Date: ${call.created_at}`);
    console.log(`SID: ${call.sid}`);
    console.log(`From: ${call.from}`);
    console.log(`To: ${call.to}`);
    console.log(`Duration: ${call.duration}s`);
    console.log(`Status: ${call.status}`);
    console.log(`User ID: ${call.user_id}`);

    // 2. Fetch details from Twilio
    try {
        console.log("\n--- TWILIO NETWORK DATA ---");
        const twilioCall = await twilioClient.calls(call.sid).fetch();
        console.log(`Twilio Status: ${twilioCall.status}`);
        console.log(`Price: ${twilioCall.price} ${twilioCall.priceUnit}`);
        console.log(`Duration: ${twilioCall.duration}s`);

        // Log warnings?
        // Note: Detailed metrics (Jitter/Packet Loss) usually normally require Voice Insights API
        // But we can check if there were issues flagged on the parent resource

    } catch (e) {
        console.error("Twilio API Error:", e.message);
    }
}

checkCall();
