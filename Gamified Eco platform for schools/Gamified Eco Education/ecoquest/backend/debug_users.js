
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

// Load env
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    console.log("Checking users...");
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error("List users error:", error);
        return;
    }

    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        console.log(`\nUser: ${user.email} (ID: ${user.id})`);
        console.log("  Confirmed at:", user.email_confirmed_at);
        console.log("  Metadata:", user.user_metadata);

        const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (profileErr) {
            console.log("  Profile Error:", profileErr.message);
        } else if (profile) {
            console.log("  Profile Found:", profile);
        } else {
            console.log("  Profile MISSING!");
        }
    }
}

check();
