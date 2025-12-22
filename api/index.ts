import { createApp } from "../server/app.js";

let app: any;

export default async function handler(req: any, res: any) {
    try {
        if (!app) {
            app = await createApp();
        }
        app(req, res);
    } catch (error: any) {
        console.error("[FATAL] Serverless Function Crash:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "The serverless function crashed during initialization.",
            details: process.env.NODE_ENV === "development" ? error.message : undefined
        });
    }
}
