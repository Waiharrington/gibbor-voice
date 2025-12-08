import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkLeads() {
    console.log("Fetching last 10 updated leads...");
    const { data, error } = await supabase
        .from('leads')
        .select('id, status, updated_at, campaign_id')
        .order('updated_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error:", error);
    } else {
        console.table(data);
    }
}

checkLeads();
