import fetch from 'node-fetch';

const test = async () => {
  const storyId = '615198af-fb96-44a4-a5e3-c5dac776a574'; // From my previous checks
  console.log(`Testing respect for story ${storyId}...`);
  try {
    const res = await fetch("http://localhost:4000/api/stories/respect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story_id: storyId })
    });
    const j = await res.json();
    console.log("Response:", JSON.stringify(j, null, 2));
  } catch (err) {
    console.error("Fetch error:", err.message);
  }
};
test();
