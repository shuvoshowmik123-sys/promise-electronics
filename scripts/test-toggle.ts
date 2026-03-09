async function testToggle() {
    console.log("Starting test...");
    try {
        // 1. Login to get cookie
        const loginRes = await fetch("http://localhost:5083/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "superadmin", password: "promise_admin_123!" })
        });

        let cookieStr = loginRes.headers.get("set-cookie");
        // Sometimes multiple cookies come back as a comma-separated string, extract connect.sid
        if (cookieStr) {
            const sidMatch = cookieStr.match(/(connect\.sid=[^;]+)/);
            if (sidMatch) cookieStr = sidMatch[1];
        }

        console.log("Login status:", loginRes.status);
        console.log("Cookie obtained:", !!cookieStr);

        if (!cookieStr) return;

        // 2. Try to toggle a module
        const toggleRes = await fetch("http://localhost:5083/api/modules/attendance/toggle", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Cookie": cookieStr
            },
            body: JSON.stringify({ portal: "admin", enabled: true })
        });

        console.log("Toggle status:", toggleRes.status);
        const toggleData = await toggleRes.text();
        console.log("Toggle response:", toggleData);

    } catch (e) {
        console.error(e);
    }
}

testToggle();
