// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from frontend/public
app.use(express.static(path.join(__dirname, "../frontend/public")));

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// validate env
console.log("Connecting to Supabase at:", process.env.SUPABASE_URL);
console.log("Key starts with:", process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10) : "MISSING");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
);

app.get("/api/health", (req, res) => {
  res.json({
    status: "Backend running",
    time: new Date().toISOString(),
    endpoints: [
      "/api/checkSchoolCode",
      "/api/login",
      "/api/test-db"
    ]
  });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const { data, error } = await supabase.from("schools").select("*");
    if (error) throw error;
    res.json({ connection: "OK", count: data.length, schools: data });
  } catch (err) {
    console.error("Database Test Error:", err);
    res.status(500).json({ connection: "FAILED", error: err.message });
  }
});

/*
  ADD SCHOOL (creates school row + creates admin auth user with metadata)
  Body: { school_name, address, school_code, admin_email, admin_password }
*/
app.post("/api/addSchool", async (req, res) => {
  try {
    let { school_name, address, school_code, admin_email, admin_password } = req.body;
    if (!school_name || !address || !school_code || !admin_email || !admin_password) {
      return res.status(400).json({ error: "All fields required" });
    }

    // normalize code
    school_code = school_code.trim().toUpperCase();

    // Check if school exists
    const { data: exists } = await supabase
      .from("schools")
      .select("id")
      .eq("school_code", school_code)
      .maybeSingle();

    if (exists) {
      return res.status(400).json({ error: "School code already exists" });
    }

    // Create admin auth user (will send confirmation email)
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email: admin_email,
      password: admin_password,
      options: {
        data: {
          full_name: school_name + " Admin",
          role: "admin"
        }
      }
    });

    if (signupErr) {
      console.error("addSchool signupErr:", signupErr);
      return res.status(400).json({ error: signupErr.message || String(signupErr) });
    }

    // Insert school row
    const { data: schoolInsert, error: schoolErr } = await supabase.from("schools").insert([
      { school_name, address, school_code }
    ]).select();

    if (schoolErr) {
      console.error("addSchool schoolErr:", schoolErr);
      return res.status(500).json({ error: schoolErr.message || String(schoolErr) });
    }

    res.json({
      message: "School created successfully. A confirmation email was sent to the admin email.",
      school_code
    });

  } catch (err) {
    console.error("addSchool error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------- CHECK SCHOOL CODE ----------
app.get("/api/checkSchoolCode", async (req, res) => {
  try {
    const codeRaw = req.query.code;
    if (!codeRaw) return res.status(400).json({ error: "code required" });

    const code = codeRaw.trim().toUpperCase();

    const { data, error } = await supabase
      .from("schools")
      .select("school_name")
      .eq("school_code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json({ exists: false });

    res.json({ exists: true, school_name: data.school_name });
  } catch (err) {
    console.error("checkSchoolCode error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------- SIGNUP STUDENT (create auth user with metadata only) ----------
app.post("/api/signup/student", async (req, res) => {
  try {
    console.log("Signup Request Body:", req.body);
    let { full_name, school_code, class_name, age, email, password } = req.body;
    if (!full_name || !school_code || !email || !password) {
      console.log("Missing fields in signup");
      return res.status(400).json({ error: "Missing required fields" });
    }

    school_code = school_code.trim().toUpperCase();
    console.log("Checking school code:", school_code);

    // validate school exists
    const { data: school, error: schoolSearchErr } = await supabase
      .from("schools")
      .select("*")
      .eq("school_code", school_code)
      .maybeSingle();

    if (schoolSearchErr) {
      console.error("School search error:", schoolSearchErr);
      throw schoolSearchErr;
    }

    if (!school) {
      console.log("School not found in DB for code:", school_code);
      return res.status(400).json({ error: "Invalid school code" });
    }

    console.log("Found school:", school.school_name);

    // Create auth user with metadata (do NOT create profiles row here — wait for email verification)
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          role: "student",
          school_code,
          class_name,
          age: age || null
        }
      }
    });

    if (signupErr) {
      console.error("signup student error:", signupErr);
      return res.status(400).json({ error: signupErr.message || String(signupErr) });
    }

    res.json({ message: "Signup started. Please verify your email to complete registration." });
  } catch (err) {
    console.error("SIGNUP ERROR DETAILED:", {
      message: err.message,
      stack: err.stack,
      cause: err.cause,
      name: err.name
    });
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------- SIGNUP TEACHER (create auth user with metadata only) ----------
app.post("/api/signup/teacher", async (req, res) => {
  try {
    let { full_name, school_code, subject, age, email, password } = req.body;
    if (!full_name || !school_code || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    school_code = school_code.trim().toUpperCase();

    // validate school exists
    const { data: school } = await supabase
      .from("schools")
      .select("*")
      .eq("school_code", school_code)
      .maybeSingle();

    if (!school) {
      return res.status(400).json({ error: "Invalid school code" });
    }

    // Create auth user with metadata (do NOT create profiles row here — wait for email verification)
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          role: "teacher",
          school_code,
          subject,
          age: age || null
        }
      }
    });

    if (signupErr) {
      console.error("signup teacher error:", signupErr);
      return res.status(400).json({ error: signupErr.message || String(signupErr) });
    }

    res.json({ message: "Signup started. Please verify your email to complete registration." });
  } catch (err) {
    console.error("signup teacher exception:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------- CREATE PROFILE AFTER EMAIL VERIFIED ----------
// Client should call this endpoint after the user clicked the verification link and signed in.
// Body: { email }
app.post("/api/createProfile", async (req, res) => {
  try {
    const email = (req.body.email || "").trim();
    if (!email) return res.status(400).json({ error: "email required" });

    // list users (admin)
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      console.error("createProfile listUsers err:", listErr);
      return res.status(500).json({ error: listErr.message || String(listErr) });
    }

    const users = usersList?.users || [];
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: "User not found" });

    // check email confirmed
    if (!user?.email_confirmed_at) {
      return res.status(400).json({ error: "Email not yet confirmed" });
    }

    const userId = user.id;

    // check if profile already exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile) {
      return res.json({ message: "Profile already exists" });
    }

    // gather metadata from auth user (user.user_metadata)
    const meta = user.user_metadata || {};
    const full_name = meta.full_name || "";
    const role = meta.role || "student";
    const school_code = (meta.school_code || "").toString().trim().toUpperCase();
    const class_name = meta.class_name || null;
    const subject = meta.subject || null;
    const age = meta.age || null;

    // insert into profiles table
    const { data: insertData, error: insertErr } = await supabase
      .from("profiles")
      .insert([{
        id: userId,
        full_name,
        role,
        school_code,
        class_name,
        subject,
        age
      }])
      .select();

    if (insertErr) {
      console.error("createProfile insertErr:", insertErr);
      return res.status(500).json({ error: insertErr.message || String(insertErr) });
    }

    res.json({ message: "Profile created successfully", profile: insertData[0] });
  } catch (err) {
    console.error("createProfile exception:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    let { email, password, school_code } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    // authenticate first
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      return res.status(400).json({ error: loginErr.message || "Invalid credentials" });
    }

    const user = loginData?.user;
    const userId = user?.id;
    if (!userId) return res.status(500).json({ error: "Login failed" });

    // check profile row
    let { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) throw profileErr;

    // IF PROFILE IS MISSING, CREATE IT AUTOMATICALLY
    if (!profile) {
      console.log(`Profile missing for user ${userId}, creating automatically...`);

      const meta = user.user_metadata || {};
      const full_name = meta.full_name || "";
      const role = meta.role || "student";
      const userSchoolCode = (meta.school_code || "").toString().trim().toUpperCase();
      const class_name = meta.class_name || null;
      const subject = meta.subject || null;
      const age = meta.age || null;

      // For students/teachers, we need to verify they provided the correct school code
      if (role !== 'admin' && userSchoolCode !== (school_code ? school_code.trim().toUpperCase() : "")) {
        return res.status(403).json({ error: "School code mismatch or missing" });
      }

      const { data: insertData, error: insertErr } = await supabase
        .from("profiles")
        .insert([{
          id: userId,
          full_name,
          role,
          school_code: userSchoolCode,
          class_name,
          subject,
          age
        }])
        .select()
        .single();

      if (insertErr) {
        console.error("Auto-create profile error:", insertErr);
        return res.json({ email_not_confirmed: true, message: "Profile creation failed. Please verify email." });
      }

      profile = insertData;
    }

    if (!profile) return res.status(500).json({ error: "Profile retrieval failed" });

    // ADMIN BYPASS: If role is admin, they don't need to provide a school_code for validation
    if (profile.role === 'admin') {
        const responsePayload = { role: profile.role, school_code: profile.school_code };
        console.log("Admin login successful:", responsePayload);
        return res.json(responsePayload);
    }

    // For students/teachers, validate school_code
    if (!school_code) {
        return res.status(400).json({ error: "School code required for students/teachers" });
    }

    if (profile.school_code !== school_code.trim().toUpperCase()) {
      return res.status(403).json({ error: "User does not belong to this school" });
    }

    // success
    const responsePayload = { role: profile.role, school_code: profile.school_code };
    console.log("User login successful:", responsePayload);
    return res.json(responsePayload);
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------- ADMIN STATS ----------
app.get("/api/admin/stats", async (req, res) => {
  try {
    const { count: schoolsCount } = await supabase.from("schools").select("*", { count: "exact", head: true });
    const { count: usersCount } = await supabase.from("profiles").select("*", { count: "exact", head: true });
    
    // Simple "Active Now" is hard without real-time tracking, so we'll mock or use recent profiles
    const { count: activeCount } = await supabase.from("profiles")
      .select("*", { count: "exact", head: true })
      .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    res.json({
      total_schools: schoolsCount || 0,
      total_users: usersCount || 0,
      active_users: (activeCount || 0) + 1 // +1 for the current admin
    });
  } catch (err) {
    console.error("stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- MONITOR MISSIONS (ALL POSTS) ----------
app.get("/api/admin/allPosts", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("club_posts")
      .select(`
        *,
        clubs ( club_name ),
        profiles ( full_name )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- MONITOR CHALLENGES (ALL) ----------
app.get("/api/admin/allChallenges", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("challenges")
      .select(`
        *,
        clubs ( club_name )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, challenges: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- DELETE CHALLENGE (ADMIN) ----------
app.post("/api/admin/deleteChallenge", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Challenge ID required" });

    const { error } = await supabase
      .from("challenges")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- GET PROFILE BY EMAIL ----------
app.get("/api/profile", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: "Email required" });

    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;

    const users = usersList?.users || [];
    const found = users.find(u => u.email === email);
    if (!found) return res.status(404).json({ error: "User not found" });

    const userId = found.id;
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) throw profileErr;
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    res.json(profile);
  } catch (err) {
    console.error("profile error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------- CLUBS MODULE ----------

// 1. GET ALL CLUBS
app.get("/api/clubs/all", async (req, res) => {
  try {
    const { data: clubs, error } = await supabase.from("clubs").select("*");
    if (error) throw error;
    res.json({ clubs: clubs || [] });
  } catch (err) {
    console.error("getClubs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. CREATE CLUB
app.post("/api/clubs/create", async (req, res) => {
  try {
    const { name, description, school_code, created_by } = req.body;
    if (!name || !school_code) return res.status(400).json({ error: "Name and school code required" });

    // Insert club
    const { data, error } = await supabase
      .from("clubs")
      .insert([{ club_name: name, description, school_code, created_by }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, club: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. JOIN CLUB
app.post("/api/clubs/join", async (req, res) => {
  try {
    const { email, club_id } = req.body;
    if (!email || !club_id) return res.status(400).json({ error: "Missing info" });

    // Resolve user_id from email (Case-Insensitive)
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });

    // Check if already member
    const { data: existing } = await supabase
      .from("club_members")
      .select("*")
      .eq("club_id", club_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) return res.json({ success: true, message: "Already a member" });

    // Insert member
    const { error: insertErr } = await supabase
      .from("club_members")
      .insert([{ club_id, user_id: user.id }]);

    if (insertErr) throw insertErr;
    res.json({ success: true });
  } catch (err) {
    console.error("join club error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. LEAVE CLUB
app.post("/api/clubs/leave", async (req, res) => {
  try {
    const { user_id, club_id } = req.body;
    const { error } = await supabase
      .from("club_members")
      .delete()
      .eq("club_id", club_id)
      .eq("user_id", user_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET CLUB INFO & MEMBERS
app.get("/api/clubs/info", async (req, res) => {
  try {
    const { club_id } = req.query;
    if (!club_id) return res.status(400).json({ error: "Club ID required" });

    // Get club details
    const { data: club, error: clubErr } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", club_id)
      .single();

    if (clubErr) throw clubErr;

    // Get members
    const { data: membersRaw, error: memErr } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", club_id);

    if (memErr) throw memErr;

    // Resolve member names from profiles
    const userIds = membersRaw.map(m => m.user_id);
    let members = [];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("full_name, id")
        .in("id", userIds);
      members = profiles || [];
    }

    res.json({ club, members });
  } catch (err) {
    console.error("club info error:", err);
    res.status(500).json({ error: err.message });
  }
});
// 6. ADD POST
app.post("/api/clubs/addPost", async (req, res) => {
  try {
    const { club_id, email, image_url, caption } = req.body;
    if (!club_id || !email || !caption) return res.status(400).json({ error: "Missing fields" });

    // Resolve user_id from email (Case-Insensitive)
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;

    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });

    const { error } = await supabase
      .from("club_posts")
      .insert([{ club_id, user_id: user.id, image_url: image_url || null, caption }]);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("addPost error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7. GET POSTS
app.get("/api/clubs/posts", async (req, res) => {
  try {
    const { club_id } = req.query;
    const { data: posts, error } = await supabase
      .from("club_posts")
      .select("*, profiles(full_name)")
      .eq("club_id", club_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. ADMIN: VIEW ALL POSTS
app.get("/api/admin/allPosts", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("club_posts")
      .select("*, profiles(full_name), clubs(club_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/allChallenges", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("challenges")
      .select("*, clubs(club_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, challenges: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- STORIES MODULE ----------

// 1. GET ALL STORIES
app.get("/api/stories", async (req, res) => {
  try {
    const { data: stories, error } = await supabase
      .from("stories")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, stories: stories || [] });
  } catch (err) {
    console.error("GET /api/stories error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. POST A STORY
app.post("/api/stories", async (req, res) => {
  try {
    const { email, content } = req.body;
    if (!email || !content) return res.status(400).json({ error: "Email and content required" });

    // Resolve user_id from email (Case-Insensitive)
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;

    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      console.warn(`Post Story: User not found for email: ${email}`);
      return res.status(404).json({ error: "User not found. Please log in again." });
    }

    const { data, error } = await supabase
      .from("stories")
      .insert([{ user_id: user.id, content }])
      .select()
      .single();

    if (error) {
      console.error("Database Insert Error (Stories):", error);
      throw error;
    }
    res.json({ success: true, story: data });
  } catch (err) {
    console.error("POST /api/stories exception:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// 3. RESPECT A STORY
app.post("/api/stories/respect", async (req, res) => {
  try {
    const { story_id } = req.body;
    if (!story_id) return res.status(400).json({ error: "Story ID required" });

    // We use a custom RPC or just increment via select/update
    // For simplicity, we'll fetch then update, but RPC is better for concurrency
    const { data: story, error: fetchErr } = await supabase
      .from("stories")
      .select("respects")
      .eq("id", story_id)
      .single();

    if (fetchErr) throw fetchErr;

    const newCount = (story.respects || 0) + 1;

    const { error: updateErr } = await supabase
      .from("stories")
      .update({ respects: newCount })
      .eq("id", story_id);

    if (updateErr) throw updateErr;

    res.json({ success: true, respects: newCount });
  } catch (err) {
    console.error("Respect Story error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- BADGE DEFINITIONS ----------
const BADGE_DEFINITIONS = [
  { id: "first_points",  name: "First Steps",    emoji: "🌱", threshold_points: 1 },
  { id: "eco_rookie",    name: "Eco Rookie",      emoji: "🐣", threshold_points: 100 },
  { id: "green_warrior", name: "Green Warrior",   emoji: "⚔️", threshold_points: 500 },
  { id: "eco_champion",  name: "Eco Champion",    emoji: "🏆", threshold_points: 1000 },
  { id: "planet_saver",  name: "Planet Saver",    emoji: "🌍", threshold_points: 5000 },
  { id: "eco_legend",    name: "Eco Legend",      emoji: "🦁", threshold_points: 10000 },
];

async function checkAndAwardBadges(userId, newPoints) {
  const earned = [];
  for (const badge of BADGE_DEFINITIONS) {
    if (newPoints >= badge.threshold_points) {
      const { error } = await supabase.from("user_badges").upsert([{
        user_id: userId,
        badge_id: badge.id,
        badge_name: badge.name,
        badge_emoji: badge.emoji
      }], { onConflict: "user_id,badge_id", ignoreDuplicates: true });
      if (!error) earned.push(badge);
    }
  }
  return earned;
}

// ADD POINTS
app.post("/api/users/addPoints", async (req, res) => {
  try {
    const { email, points_to_add, game_name } = req.body;
    console.log(`[Points] Attempting to add ${points_to_add} points for ${email} from ${game_name}`);
    
    if (!email || points_to_add === undefined) {
      console.log("[Points] Missing email or points");
      return res.status(400).json({ error: "Email and points required" });
    }
    if (typeof points_to_add !== 'number' || points_to_add < 0 || points_to_add > 10000) {
      return res.status(400).json({ error: "Invalid points value (must be 0–10000)" });
    }

    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;

    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });

    const { data: profile, error: getErr } = await supabase
      .from("profiles")
      .select("points")
      .eq("id", user.id)
      .single();
    if (getErr) {
      console.error("[Points] Error fetching profile:", getErr);
      throw getErr;
    }
    
    console.log(`[Points] Current points for ${user.id}: ${profile.points || 0}`);

    const newPoints = (profile.points || 0) + points_to_add;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ points: newPoints })
      .eq("id", user.id);
    if (updateErr) {
      console.error("[Points] Error updating points:", updateErr);
      throw updateErr;
    }
    
    console.log(`[Points] Success! New total for ${email}: ${newPoints}`);

    // Record game score
    if (game_name && points_to_add > 0) {
      await supabase.from("game_scores").insert([{
        user_id: user.id,
        game_name: game_name,
        score: points_to_add
      }]).catch(() => {});
    }

    // Award badges
    const earnedBadges = await checkAndAwardBadges(user.id, newPoints);

    res.json({ success: true, new_points: newPoints, earned_badges: earnedBadges });
  } catch (err) {
    console.error("addPoints error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- LEADERBOARD ----------
app.get("/api/leaderboard", async (req, res) => {
  try {
    const { type, school_code, limit = 20 } = req.query;
    let query = supabase
      .from("profiles")
      .select("full_name, points, school_code, class_name")
      .eq("role", "student")
      .order("points", { ascending: false })
      .limit(parseInt(limit));
    if (type === "school" && school_code) {
      query = query.eq("school_code", school_code.toUpperCase());
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ leaderboard: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- USER BADGES ----------
app.get("/api/users/badges", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });
    const { data, error } = await supabase
      .from("user_badges")
      .select("badge_id, badge_name, badge_emoji, earned_at")
      .eq("user_id", user.id)
      .order("earned_at", { ascending: true });
    if (error) throw error;
    res.json({ badges: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- STREAK ----------
app.post("/api/users/updateStreak", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("streak, last_active_date")
      .eq("id", user.id)
      .single();

    const today = new Date().toISOString().split('T')[0];
    const lastDate = profile?.last_active_date;
    let newStreak = profile?.streak || 0;

    if (lastDate === today) {
      return res.json({ streak: newStreak, message: "Already updated today" });
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    newStreak = lastDate === yesterdayStr ? newStreak + 1 : 1;

    await supabase.from("profiles").update({
      streak: newStreak, last_active_date: today
    }).eq("id", user.id);

    res.json({ streak: newStreak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- GAME HISTORY ----------
app.get("/api/users/gameHistory", async (req, res) => {
  try {
    const { email, limit = 10 } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });
    const { data, error } = await supabase
      .from("game_scores")
      .select("game_name, score, played_at")
      .eq("user_id", user.id)
      .order("played_at", { ascending: false })
      .limit(parseInt(limit));
    if (error) throw error;
    res.json({ history: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- HEARTBEAT ----------
app.post("/api/users/heartbeat", async (req, res) => {
  try {
    const { email, page } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });
    await supabase.from("user_sessions").upsert([{
      user_id: user.id,
      last_seen: new Date().toISOString(),
      page: page || "unknown"
    }], { onConflict: "user_id" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ADMIN: ACTIVE USERS ----------
app.get("/api/admin/activeUsers", async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("user_sessions")
      .select("user_id, last_seen, page")
      .gte("last_seen", fiveMinutesAgo);
    if (error) throw error;
    const userIds = data.map(d => d.user_id);
    let profiles = [];
    if (userIds.length > 0) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, role, school_code")
        .in("id", userIds);
      profiles = p || [];
    }
    const result = data.map(session => {
      const profile = profiles.find(p => p.id === session.user_id) || {};
      return { ...session, ...profile };
    });
    res.json({ active_count: result.length, users: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ADMIN: STATS ----------
app.get("/api/admin/stats", async (req, res) => {
  try {
    const { count: schoolCount } = await supabase
      .from("schools").select("*", { count: "exact", head: true });
    const { count: userCount } = await supabase
      .from("profiles").select("*", { count: "exact", head: true });
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: activeCount } = await supabase
      .from("user_sessions")
      .select("*", { count: "exact", head: true })
      .gte("last_seen", fiveMinutesAgo);
    res.json({
      total_schools: schoolCount || 0,
      total_users: userCount || 0,
      active_users: activeCount || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ADMIN: USERS LIST ----------
app.get("/api/admin/users", async (req, res) => {
  try {
    const { role, school_code, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = supabase
      .from("profiles")
      .select("id, full_name, role, school_code, class_name, subject, points, streak, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);
    if (role) query = query.eq("role", role);
    if (school_code) query = query.eq("school_code", school_code.toUpperCase());
    const { data, error, count } = await query;
    if (error) throw error;
    const { data: usersList } = await supabase.auth.admin.listUsers();
    const authUsers = usersList?.users || [];
    const usersWithEmail = (data || []).map(profile => {
      const authUser = authUsers.find(u => u.id === profile.id);
      return { ...profile, email: authUser?.email || "N/A", confirmed: !!authUser?.email_confirmed_at };
    });
    res.json({ users: usersWithEmail, total: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ADMIN: ANALYTICS ----------
app.get("/api/admin/analytics", async (req, res) => {
  try {
    const { data: roleData } = await supabase.from("profiles").select("role");
    const roleCounts = { student: 0, teacher: 0, admin: 0 };
    (roleData || []).forEach(r => { if (roleCounts[r.role] !== undefined) roleCounts[r.role]++; });

    const { data: schoolPoints } = await supabase
      .from("profiles").select("school_code, points").eq("role", "student");
    const schoolMap = {};
    (schoolPoints || []).forEach(p => {
      if (!schoolMap[p.school_code]) schoolMap[p.school_code] = 0;
      schoolMap[p.school_code] += (p.points || 0);
    });
    const topSchools = Object.entries(schoolMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([code, pts]) => ({ school_code: code, total_points: pts }));

    const { data: gamePlays } = await supabase.from("game_scores").select("game_name");
    const gameMap = {};
    (gamePlays || []).forEach(g => { gameMap[g.game_name] = (gameMap[g.game_name] || 0) + 1; });
    const gameStats = Object.entries(gameMap).sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ game_name: name, play_count: count }));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newUsers7d } = await supabase
      .from("profiles").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo);

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: activeNow } = await supabase
      .from("user_sessions").select("*", { count: "exact", head: true }).gte("last_seen", fiveMinutesAgo);

    res.json({
      role_counts: roleCounts, top_schools: topSchools,
      game_stats: gameStats, new_users_7d: newUsers7d || 0, active_now: activeNow || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- TEACHER: STUDENTS ----------
app.get("/api/teacher/students", async (req, res) => {
  try {
    const { school_code } = req.query;
    if (!school_code) return res.status(400).json({ error: "school_code required" });
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, class_name, points, streak, created_at")
      .eq("role", "student")
      .eq("school_code", school_code.toUpperCase())
      .order("points", { ascending: false });
    if (error) throw error;
    res.json({ students: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- QUIZ SUBMIT ----------
app.post("/api/quiz/submit", async (req, res) => {
  try {
    const { email, quiz_id, score, total_questions, correct_answers } = req.body;
    console.log(`[Quiz] Submitting score ${score} for ${email} (Topic: ${quiz_id})`);
    
    if (!email || score === undefined) {
      console.log("[Quiz] Missing email or score");
      return res.status(400).json({ error: "Email and score required" });
    }
    if (typeof score !== 'number' || score < 0 || score > 10000) return res.status(400).json({ error: "Invalid score" });
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const user = usersList?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });
    const { data: profile } = await supabase.from("profiles").select("points").eq("id", user.id).single();
    const newPoints = (profile?.points || 0) + score;
    await supabase.from("profiles").update({ points: newPoints }).eq("id", user.id);
    await supabase.from("game_scores").insert([{ user_id: user.id, game_name: `Quiz: ${quiz_id || 'general'}`, score }]).catch(() => {});
    const earnedBadges = await checkAndAwardBadges(user.id, newPoints);
    res.json({ success: true, new_points: newPoints, earned_badges: earnedBadges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. HELPER: GET USER ID
app.get("/api/getUserId", async (req, res) => {
  try {
    const { email } = req.query;
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const user = list?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user_id: user.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
