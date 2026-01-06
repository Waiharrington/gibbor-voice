
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function monitor() {
    console.clear();
    console.log(`--- LIVE MONITORING: ${new Date().toLocaleTimeString()} ---`);

    // 1. Check Active Sessions (Heartbeat within last 2 minutes)
    // Since heartbeat updates 'duration_seconds' but not 'updated_at' explicitly in some versions,
    // we rely on 'ended_at' being null and 'started_at' being today.
    // Ideally user app updates 'updated_at' or we check duration changes.
    // For now, let's list sessions where ended_at is null.

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

    // 2. Check Recent Calls (Last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: calls, error: callError } = await supabase
        .from('calls')
        .select(`
            id,
            to_number,
            status,
            created_at,
            direction,
            user_id
        `)
        .gte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(5);

    if (callError) console.error("Call Error:", callError);

    console.log(`\n📞 RECENT CALLS (Last 10m):`);
    if (calls && calls.length > 0) {
        calls.forEach(c => {
            console.log(`   - [${new Date(c.created_at).toLocaleTimeString()}] ${c.direction} to ${c.to_number}: ${c.status}`);
        });
    } else {
        console.log("   No calls in the last 10 minutes.");
    }
}

monitor();
