require("dotenv").config({
    path: "../.env"
});

async function testSupabase() {

    console.log("SUPABASE_URL:", process.env.SUPABASE_URL);

    const url =
        `${process.env.SUPABASE_URL}/rest/v1/buses?select=*`;

    try {

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "apikey": process.env.SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json"
            }
        });

        console.log("HTTP STATUS:", response.status);

        const text = await response.text();

        console.log("SUPABASE RESPONSE:");
        console.log(text);

    } catch (error) {

        console.error("SUPABASE FETCH ERROR:");
        console.error(error);

    }
}

testSupabase();