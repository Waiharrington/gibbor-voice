
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function monitor() {
    console.log(`\n--- MONITORING START ---`);

    // 1. Check Active Sessions
    const { data: sessions, error: sessionError } = await supabase
        .from('agent_sessions')
        .select(`
            user_id,
            started_at,
            duration_seconds,
            profiles (full_name, email)
        `)
        .is('ended_at', null)
        .order('started_at', { ascending: false });

    if (sessionError) console.error("Session Error:", sessionError);

    console.log(`\n🔵 ACTIVE SESSIONS (${sessions?.length || 0}):`);
    if (sessions) {
        sessions.forEach(s => {
            const name = s.profiles?.full_name || s.profiles?.email || 'Unknown';
            const duration = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m` : '0m';
            console.log(`   - ${name}: Online for ${duration} (Started: ${new Date(s.started_at).toLocaleTimeString()})`);
        });
    }

    // 2. Check Recent Calls
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Debug: Check columns first
    const { data: sampleCall } = await supabase.from('calls').select('*').limit(1);
    if (sampleCall && sampleCall.length > 0) {
        // console.log("Call Columns:", Object.keys(sampleCall[0]));
        // Use keys dynamically if needed, but for now we fallback to 'recipient' or 'to'
    }

    const { data: calls, error: callError } = await supabase
        .from('calls')
        .select('*') // Select all to avoid column error
        .gte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(5);

    if (callError) console.error("Call Error:", callError);

    console.log(`\n📞 RECENT CALLS (Last 10m):`);
    if (calls && calls.length > 0) {
        calls.forEach(c => {
            const dest = c.to_number || c.to || c.recipient || c.phone || 'Unknown';
            const dir = c.direction || 'outbound';
            console.log(`   - [${new Date(c.created_at).toLocaleTimeString()}] ${dir} to ${dest}: ${c.status}`);
        });
    } else {
        console.log("   No calls in the last 10 minutes.");
    }
}

monitor();
