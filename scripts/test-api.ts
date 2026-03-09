// Test the toggle API end-to-end using the live server
const BASE = "http://localhost:5083";

async function test() {
    // Step 1: Login
    console.log("1. Logging in...");
    const loginRes = await fetch(`${BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin123" }),
        redirect: "manual",
    });
    console.log("   Login status:", loginRes.status);
    const loginBody = await loginRes.json();
    console.log("   Login body:", JSON.stringify(loginBody).slice(0, 200));

    // Extract session cookie
    const setCookieHeader = loginRes.headers.getSetCookie?.();
    const rawCookie = loginRes.headers.get("set-cookie");
    console.log("   Raw set-cookie:", rawCookie?.slice(0, 120));

    let cookie = "";
    if (rawCookie) {
        const match = rawCookie.match(/(connect\.sid=[^;]+)/);
        if (match) cookie = match[1];
    }
    console.log("   Extracted cookie:", cookie || "(none)");

    if (!cookie) {
        console.log("\n❌ No session cookie obtained. Cannot test toggle.");
        process.exit(1);
    }

    // Step 2: Verify session with /api/admin/me
    console.log("\n2. Checking session with /api/admin/me...");
    const meRes = await fetch(`${BASE}/api/admin/me`, {
        headers: { "Cookie": cookie },
    });
    console.log("   /api/admin/me status:", meRes.status);
    const meBody = await meRes.json();
    console.log("   User role:", meBody.role || meBody.error);

    // Step 3: Toggle a module
    console.log("\n3. Toggling 'attendance' module (admin=true)...");
    const toggleRes = await fetch(`${BASE}/api/modules/attendance/toggle`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Cookie": cookie,
        },
        body: JSON.stringify({ portal: "admin", enabled: true }),
    });
    console.log("   Toggle status:", toggleRes.status);
    const toggleBody = await toggleRes.text();
    console.log("   Toggle response:", toggleBody.slice(0, 300));

    // Step 4: Test preset
    console.log("\n4. Applying 'phase1' preset...");
    const presetRes = await fetch(`${BASE}/api/modules/bulk-preset`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cookie": cookie,
        },
        body: JSON.stringify({ preset: "phase1" }),
    });
    console.log("   Preset status:", presetRes.status);
    const presetBody = await presetRes.text();
    console.log("   Preset response length:", presetBody.length, "chars");
    if (presetRes.status !== 200) {
        console.log("   Preset error:", presetBody.slice(0, 300));
    }

    console.log("\n=== TEST COMPLETE ===");
    process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
