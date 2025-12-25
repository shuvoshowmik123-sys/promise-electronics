
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("No API key found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("Successfully initialized model client");
        // There isn't a direct listModels method on the client instance in some versions,
        // but we can try to generate content to see if it works, or use the model manager if available.
        // Actually, for this SDK, we might not be able to list models easily without the admin SDK.
        // So let's just try to generate content with a few known model names to see which ones work.

        const modelsToTest = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

        for (const modelName of modelsToTest) {
            console.log(`Testing ${modelName}...`);
            try {
                const m = genAI.getGenerativeModel({ model: modelName });
                await m.generateContent("Hello");
                console.log(`✅ ${modelName} is AVAILABLE`);
            } catch (e: any) {
                console.log(`❌ ${modelName} failed: ${e.message.split('\n')[0]}`);
            }
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
