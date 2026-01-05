import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
    console.log("--- Debugging Metrics ---");

    // Server 'Today' (Local System Time which is likely UTC in cloud, but here it's Windows Local)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();
    console.log("System Local 'Today' ISO:", todayISO);

    // Venezuela Logic Simulation
    // Target: Midnight in Venezuela (UTC-4) -> 04:00:00 UTC
    const now = new Date();
    // Get Venezuela time string
    const vzString = now.toLocaleString("en-US", { timeZone: "America/Caracas" });
    const vzDate = new Date(vzString); // This is now a Date object reflecting VZ time components but in Local context
    vzDate.setHours(0, 0, 0, 0); // Midnight VZ

    // We need to construct the UTC equivalent of "Midnight VZ"
    // Midnight VZ is 04:00 UTC.
    // If we simply take the components:
    const year = vzDate.getFullYear();
    const month = vzDate.getMonth();
    const day = vzDate.getDate();
    // Create UTC date: Year, Month, Day, 4, 0, 0
    // But offsets change with DST? Venezuela doesn't observe DST currently (UTC-4).
    const vzMidnightUTC = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));

    console.log("Venezuela Midnight (Calculated UTC):", vzMidnightUTC.toISOString());

    // Fetch Sessions for a user
    const { data: profiles } = await supabase.from('profiles').select('id, email').limit(5);

    for (const user of profiles) {
        console.log(`\nChecking User: ${user.email} (${user.id})`);

        // Check ALL sessions for this user to see if there are rogue ones
        const { data: allSessions } = await supabase
            .from('agent_sessions')
            .select('*')
            .eq('user_id', user.id)
            .order('started_at', { ascending: false });

        console.log(`Total Sessions Found: ${allSessions.length}`);

        // Filter manually to see which ones match
        const matchingSessions = allSessions.filter(s => new Date(s.started_at) >= vzMidnightUTC);
        console.log(`Sessions starting after VZ Midnight (${vzMidnightUTC.toISOString()}): ${matchingSessions.length}`);

        // Check system filter results
        const { data: systemFiltered } = await supabase
            .from('agent_sessions')
            .select('*')
            .eq('user_id', user.id)
            .gte('started_at', todayISO);

        console.log(`Sessions filtered by system (Local ISO ${todayISO}): ${systemFiltered.length}`);


        let secondsOnline = 0;
        matchingSessions.forEach(s => {
            let dur = 0;
            if (s.duration_seconds) {
                dur = s.duration_seconds;
            } else if (s.started_at && !s.ended_at) {
                const start = new Date(s.started_at).getTime();
                const now = Date.now();
                dur = Math.floor((now - start) / 1000);
            }
            console.log(` - Session ${s.id}: Start=${s.started_at}, Duration=${(dur / 3600).toFixed(2)}h`);
            secondsOnline += dur;
        });

        console.log(`Calculated VZ Time: ${(secondsOnline / 3600).toFixed(2)} hours`);
    }
}

run();
