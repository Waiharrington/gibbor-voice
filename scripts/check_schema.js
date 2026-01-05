const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'frontend/.env' });
// Using frontend env to get URL and ANON key (usually enough for reading if RLS allows or if we use service key from backend)
// Actually better to use backend credentials to be sure.
dotenv.config({ path: 'backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials. Make sure backend/.env exists.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("Fetching one row from agent_sessions...");
    const { data, error } = await supabase
        .from('agent_sessions')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error:", error);
    } else {
        if (data.length > 0) {
            console.log("Columns found:", Object.keys(data[0]));
            console.log("Sample Data:", data[0]);
        } else {
            console.log("Table is empty, cannot infer columns from data.");
        }
    }
}

checkSchema();
