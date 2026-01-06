
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) { console.error("Missing credentials"); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Fetching one call...");
    const { data, error } = await supabase.from('calls').select('*').limit(1);
    if (error) console.error(error);
    else if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]));
        console.log("Sample:", data[0]);
    } else {
        console.log("No calls found.");
    }
}
check();
