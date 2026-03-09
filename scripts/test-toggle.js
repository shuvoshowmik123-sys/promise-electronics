import { log } from '../server/app.js';

async function testToggle() {
    console.log("Starting test...");
    try {
        // 1. Login to get cookie
        const loginRes = await fetch("http://localhost:5083/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "superadmin", password: "promise_admin_123!" })
        });

        const cookie = loginRes.headers.get("set-cookie");
        console.log("Login status:", loginRes.status);
        console.log("Cookie obtained:", !!cookie);

        if (!cookie) return;

        // 2. Try to toggle a module
        const toggleRes = await fetch("http://localhost:5083/api/modules/attendance/toggle", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Cookie": cookie
            },
            body: JSON.stringify({ portal: "admin", enabled: true })
        });

        console.log("Toggle status:", toggleRes.status);
        const toggleData = await toggleRes.json();
        console.log("Toggle response:", toggleData);

    } catch (e) {
        console.error(e);
    }
}

testToggle();
