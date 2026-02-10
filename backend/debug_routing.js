
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testRouting() {
    // Parameters from the User's Screenshot context
    const To = '+16199353617';
    const From = '+18452085976';

    console.log(`--- DEBUG ROUTING SIMULATION ---`);
    console.log(`Customer (From): ${From}`);
    console.log(`Twilio Num (To): ${To}`);

    // 1. Check Sticky Routing
    console.log(`\n1. CHECKING STICKY ROUTING...`);
    const { data: lastCall, error: lastCallError } = await supabase
        .from('calls')
        .select('user_id, created_at, caller_number')
        .eq('to', From) // Customer
        .eq('direction', 'outbound')
        .eq('caller_number', To) // Must match the number they dialed
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (lastCallError && lastCallError.code !== 'PGRST116') console.log("Error fetching last call:", lastCallError.message);

    if (lastCall) {
        console.log(`   [MATCH] Found previous call by UserID: ${lastCall.user_id} at ${lastCall.created_at}`);
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', lastCall.user_id).single();
        console.log(`   [TARGET] Would route to: ${profile?.email}`);
    } else {
        console.log(`   [NO MATCH] No previous outbound call found from ${To} to ${From}.`);
    }

    // 2. Check Zone Simulring
    console.log(`\n2. CHECKING ZONE SIMULRING...`);
    // a. Check if 'To' number is assigned to a zone
    const { data: zoneNum, error: zoneError } = await supabase
        .from('zone_numbers')
        .select('zone_id, zones(name)')
        .eq('phone_number', To)
        .single();

    if (zoneError) console.log("   [ERROR] Zone Lookup Error:", zoneError.message);

    if (zoneNum) {
        console.log(`   [MATCH] Number ${To} belongs to Zone: ${zoneNum.zones?.name} (ID: ${zoneNum.zone_id})`);

        // b. Get Agents
        const { data: agents } = await supabase
            .from('profiles')
            .select('id, email, role')
            .eq('zone_id', zoneNum.zone_id);

        console.log(`   [AGENTS] Found ${agents?.length || 0} agents in this zone:`);
        agents?.forEach(a => console.log(`      - ${a.email} (${a.role})`));

        if (!agents || agents.length === 0) {
            console.log("   [WARNING] Zone exists but has NO AGENTS assigned!");
        }

    } else {
        console.log(`   [FAIL] Number ${To} is NOT assigned to any Zone in 'zone_numbers' table.`);
        console.log(`   This is likely the cause. The system doesn't know who owns this number.`);
    }

    // 3. Check All Zone Numbers (Debugging Format)
    console.log(`\n3. DUMPING FIRST 5 ZONE NUMBERS (To check format)`);
    const { data: dump } = await supabase.from('zone_numbers').select('phone_number').limit(5);
    dump?.forEach(d => console.log(`   - ${d.phone_number}`));
}

testRouting();
