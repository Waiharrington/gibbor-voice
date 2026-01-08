
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const twilioClient = twilio(process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET, { accountSid: process.env.TWILIO_ACCOUNT_SID });
const CALL_SID = "CA502ac9b685f96839e314317f46425070";

async function checkInsights() {
    console.log(`Checking Insights for ${CALL_SID}...`);

    try {
        // 1. Fetch Call Summary from Insights (Note: requires Insights enabled on account)
        // Accessing via raw request or specific helper if available in this SDK version
        // Trying standard gathering first

        // This endpoint often provides jitter/packet loss summaries
        const summary = await twilioClient.insights.v1.callSummaries(CALL_SID).fetch();

        console.log("\n--- INSIGHTS SUMMARY ---");
        console.log("Connect Duration:", summary.connectDuration);
        console.log("Sip Response:", summary.sipResponseCode);

        if (summary.clientEdge) {
            console.log("\n--- CLIENT EDGE (User's Browser) ---");
            // Check specific metrics if available in object structure
            // Usually hidden in properties like 'metrics' or similar, let's dump specific keys
            const metrics = summary.clientEdge; // often has network details
            console.log("Network:", JSON.stringify(metrics, null, 2));
        }

        if (summary.carrierEdge) {
            console.log("\n--- CARRIER EDGE (Twilio -> Network) ---");
            console.log("Network:", JSON.stringify(summary.carrierEdge, null, 2));
        }

    } catch (e) {
        console.error("Insights Error (Might not be enabled or permission denied):", e.message);

        // Fallback: Fetch call notifications (Errors/Warnings)
        try {
            const notifications = await twilioClient.calls(CALL_SID).notifications.list();
            console.log(`\nFound ${notifications.length} notifications/warnings:`);
            notifications.forEach(n => {
                console.log(`[${n.messageDate}] Code ${n.errorCode}: ${n.messageText}`);
            });
        } catch (err2) {
            console.error("Notifications Error:", err2.message);
        }
    }
}

checkInsights();
