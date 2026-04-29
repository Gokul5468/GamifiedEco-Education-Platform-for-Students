import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
);

const run = async () => {
  console.log("Checking ALL columns of stories table...");
  const { data, error } = await supabase.from("stories").select("*").limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Columns found:", Object.keys(data[0] || {}));
  }
};
run();
