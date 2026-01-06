
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Must be Service Role Key

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteUser(email) {
    console.log(`Searching for user: ${email}...`);

    // 1. Find User by Email in Profiles (or Auth)
    // Auth admin API allows listUsers but it's paginated.
    // Easier to check 'profiles' table first to get ID, assuming profile exists.

    // Check specific profile
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', email);

    if (profileError) {
        console.error("Error finding profile:", profileError);
        return;
    }

    if (!profiles || profiles.length === 0) {
        console.log("No profile found. Searching in Auth directly...");
        const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
            console.error("Error listing auth users:", listError);
            return;
        }

        const text = email.toLowerCase().trim();
        const foundUser = authUsers.users.find(u => u.email?.toLowerCase().includes(text));

        if (!foundUser) {
            console.error(`❌ User '${email}' NOT found in Auth or Profiles.`);
            return;
        }

        console.log(`Found in Auth: ${foundUser.email} (${foundUser.id})`);

        // Proceed to delete foundUser
        console.log(`Step 1: Deleting from Auth...`);
        const { error: matchDeleteError } = await supabase.auth.admin.deleteUser(foundUser.id);

        if (matchDeleteError) {
            console.error("❌ Auth Deletion Failed:", matchDeleteError.message);
            // Cleanup and Retry
            console.log("Attempting to clean dependencies (sessions, calls)...");

            // 1. Sessions
            const { error: sessionError } = await supabase.from('agent_sessions').delete().eq('user_id', foundUser.id);
            if (sessionError) console.log("Error deleting sessions:", sessionError.message);
            else console.log("Cleaned agent_sessions.");

            // 2. Calls
            const { error: callsError } = await supabase.from('calls').delete().eq('user_id', foundUser.id);
            if (callsError) console.log("Error deleting calls:", callsError.message);
            else console.log("Cleaned calls.");

            // 3. Profile (By ID explicitly, in case email didn't match)
            const { error: profileDelError } = await supabase.from('profiles').delete().eq('id', foundUser.id);
            if (profileDelError) console.log("Error deleting profile by ID:", profileDelError.message);
            else console.log("Cleaned profile (by ID).");

            // 4. Leads (If referenced?) - unlikely but good to check if 'campaign_id' misused or similar?
            // Or maybe 'agent_id' column if added? Let's assume none for now unless error persists.

            // Retry
            console.log("Retrying Auth Deletion...");
            const { error: retryError } = await supabase.auth.admin.deleteUser(foundUser.id);
            if (retryError) console.error("❌ Retry Auth Deletion Failed:", retryError.message);
            else console.log("✅ Retry Auth Deletion Successful.");

        } else {
            console.log("✅ Auth Deletion Successful.");
        }
        return; // Done
    }

    const user = profiles[0];
    console.log(`Found user: ${user.full_name} (${user.id})`);

    // 2. Attempt Deletion
    console.log(`Step 1: Deleting from Auth (which should trigger profile cascade if set)...`);
    const { data: deleteData, error: deleteError } = await supabase.auth.admin.deleteUser(
        user.id
    );

    if (deleteError) {
        console.error("❌ Auth Deletion Failed:", deleteError.message);
        console.log("Details:", deleteError);
    } else {
        console.log("✅ Auth Deletion Successful.");
    }

    // 3. Clean up Profile Manually if still exists (Double check)
    // If foreign keys prevent Auth deletion, it usually errors out.
    // If logic is separated, we try deleting profile manually just in case.

    console.log(`Step 2: Ensuring DB records are gone...`);
    const { error: dbError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

    if (dbError) {
        console.error("❌ Profile Deletion Failed (likely constraints):", dbError.message);
        console.log("Attempting to clean dependencies (sessions, calls, leads?)...");

        // Try deleting sessions first
        const { error: sessionError } = await supabase.from('agent_sessions').delete().eq('user_id', user.id);
        if (sessionError) console.log("Error deleting sessions:", sessionError.message);
        else console.log("Cleaned agent_sessions.");

        // Try deleting calls
        const { error: callsError } = await supabase.from('calls').delete().eq('user_id', user.id);
        if (callsError) console.log("Error deleting calls:", callsError.message);
        else console.log("Cleaned calls.");

        // Retry Profile Delete
        const { error: retryError } = await supabase.from('profiles').delete().eq('id', user.id);
        if (retryError) console.error("❌ Retry Profile Deletion Failed:", retryError.message);
        else console.log("✅ Retry Profile Deletion Successful.");

    } else {
        console.log("✅ Profile Deletion Successful (or already gone).");
    }
}

const targetEmail = process.argv[2];
if (!targetEmail) {
    console.error("Please provide email: node delete_user_manual.js email@example.com");
} else {
    deleteUser(targetEmail);
}
