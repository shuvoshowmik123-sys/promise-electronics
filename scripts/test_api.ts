
async function testApi() {
    try {
        const response = await fetch("http://localhost:5000/api/challans");
        if (!response.ok) {
            console.error("API Error:", response.status, response.statusText);
            const text = await response.text();
            console.error("Body:", text);
        } else {
            const data = await response.json();
            console.log("API Success:", JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

testApi();
