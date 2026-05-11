import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
);

const run = async () => {
  console.log("Checking stories table...");
  const { data, error } = await supabase.from("stories").select("*").limit(1);
  if (error) {
    console.error("Error accessing stories table:", error);
  } else {
    console.log("Stories table accessible. Sample data:", data);
  }

  console.log("\nChecking profiles table...");
  const { data: pData, error: pError } = await supabase.from("profiles").select("*").limit(1);
  if (pError) {
    console.error("Error accessing profiles table:", pError);
  } else {
    console.log("Profiles table accessible. Sample data:", pData);
  }
};
run();
