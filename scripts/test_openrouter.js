
const OPENROUTER_API_KEY = "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";
const SITE_URL = "http://localhost:5000";
const SITE_NAME = "Promise Electronics";

async function testOpenRouter() {
    console.log("Testing OpenRouter: tngtech/deepseek-r1t2-chimera:free");
    const start = Date.now();

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "qwen/qwen3-4b:free",
                "messages": [
                    {
                        "role": "user",
                        "content": "Hello Daktar Vai, my TV display is flickering. Can you help? Reply in Banglish."
                    }
                ]
            })
        });

        const data = await response.json();
        const duration = Date.now() - start;

        console.log(`\nStatus: ${response.status}`);
        console.log(`Duration: ${duration}ms`);

        if (data.choices && data.choices[0]) {
            console.log("\nResponse:", data.choices[0].message.content);
            console.log("\n✅ Test Successful: API Key works and model responds.");
        } else {
            console.log("\n❌ Error Response:", JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

testOpenRouter();
