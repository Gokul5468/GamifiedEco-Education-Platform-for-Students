import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
);

const run = async () => {
  const email = "g.v1065338@gmail.com"; // One of the users I found
  const content = "Test story from debug script";

  console.log(`Testing post story for ${email}...`);

  // Resolve user_id from email
  const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error("List users error:", listErr);
    return;
  }
  const user = usersList?.users?.find(u => u.email === email);
  if (!user) {
    console.error("User not found");
    return;
  }

  console.log(`Found user ID: ${user.id}`);

  const { data, error } = await supabase
    .from("stories")
    .insert([{ user_id: user.id, content }])
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Insert success:", data);
  }
};
run();
