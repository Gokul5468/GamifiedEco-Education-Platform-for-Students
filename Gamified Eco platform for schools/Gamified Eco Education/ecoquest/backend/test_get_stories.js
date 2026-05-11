import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
);

const run = async () => {
  console.log("Testing GET /api/stories join...");
  const { data: stories, error } = await supabase
    .from("stories")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET stories error:", error);
  } else {
    console.log("GET stories success. Count:", stories.length);
    console.log("Sample story with profile:", JSON.stringify(stories[0], null, 2));
  }
};
run();
