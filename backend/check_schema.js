import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";

// Load env from current directory
if (fs.existsSync('.env')) {
    dotenv.config({ path: '.env' });
} else {
    console.error("No .env found in backend dir");
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials.");
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
            // console.log("Sample Data:", data[0]);
        } else {
            console.log("Table is empty, cannot infer columns from data.");
            // Try getting all columns via mismatch error or just assume simple schema if empty
            // Or try inserting a row with a random column and see error?
            // Let's create a dummy row to inspect if needed, but first check if empty.
            await tryInsert();
        }
    }
}

async function tryInsert() {
    // Try to insert with just user_id (assuming we have a valid one? or random?)
    // Need a valid user_id if FK constraint exists.
    // Let's skip insert for now and hope for data.
}

checkSchema();
