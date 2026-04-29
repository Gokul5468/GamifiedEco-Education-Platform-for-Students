import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
);

const run = async () => {
  console.log("Checking respects column...");
  const { data, error } = await supabase.from("stories").select("respects").limit(1);
  if (error) {
    console.error("Error accessing respects column:", error.message);
    console.log("TIP: You likely need to add the column in Supabase.");
  } else {
    console.log("Respects column exists. Current value:", data[0]?.respects);
  }
};
run();
