import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
);

const run = async () => {
  const storyId = '615198af-fb96-44a4-a5e3-c5dac776a574';
  console.log(`Simulating respect increment for story ${storyId}...`);
  
  try {
    const { data: story, error: fetchErr } = await supabase
      .from("stories")
      .select("respects")
      .eq("id", storyId)
      .single();

    if (fetchErr) throw fetchErr;

    const currentCount = story.respects || 0;
    const newCount = currentCount + 1;
    console.log(`Current: ${currentCount}, New: ${newCount}`);

    const { error: updateErr } = await supabase
      .from("stories")
      .update({ respects: newCount })
      .eq("id", storyId);

    if (updateErr) throw updateErr;

    console.log("Update success!");
  } catch (err) {
    console.error("Error:", err.message);
  }
};
run();
