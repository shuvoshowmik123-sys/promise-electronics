import { createApp } from "../server/app.js";

let app: any;

export default async function handler(req: any, res: any) {
    if (!app) {
        app = await createApp();
    }
    app(req, res);
}
