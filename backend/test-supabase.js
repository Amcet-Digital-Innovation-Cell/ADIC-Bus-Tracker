require("dotenv").config({ path: "./.env" });
const { db, supabase } = require("./config/supabase");

async function testSupabase() {
    console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
    console.log("Testing bus_tracking schema queries via db client...");

    try {
        const { data, error, status } = await db.from("buses").select("*").limit(2);
        console.log("DB CLIENT STATUS:", status);
        if (error) {
            console.error("DB CLIENT ERROR:", error.message, error);
        } else {
            console.log("DB CLIENT SUCCESS! Fetched rows:", data?.length, data);
        }
    } catch (e) {
        console.error("DB CLIENT EXCEPTION:", e.message);
    }

    try {
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/buses?select=*&limit=2`, {
            method: "GET",
            headers: {
                "apikey": process.env.SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
                "Accept-Profile": "bus_tracking"
            }
        });
        console.log("RAW FETCH (bus_tracking) STATUS:", response.status);
        const text = await response.text();
        console.log("RAW FETCH RESPONSE:", text.slice(0, 300));
    } catch (error) {
        console.error("FETCH ERROR:", error.message);
    }
}

testSupabase();