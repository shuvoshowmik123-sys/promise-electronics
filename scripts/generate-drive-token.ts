import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import open from 'open';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { fileURLToPath } from 'url';

// Fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function main() {
    console.log('Generating Google Drive Refresh Token...');

    // 1. Generate Auth URL
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Critical for refresh token
        scope: SCOPES,
        prompt: 'consent' // Force consent to ensure we get a refresh token
    });

    console.log('\nAuthorize this app by visiting this url:');
    console.log(authUrl);

    // 2. Open Browser
    await open(authUrl);

    // 3. Start temporary server to handle callback
    const server = http.createServer(async (req, res) => {
        if (req.url?.startsWith('/oauth2callback')) {
            const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
            const code = qs.get('code');

            console.log(`\nCode received: ${code}`);

            res.end('Authentication successful! You can close this tab and check the active terminal.');
            server.close();

            if (code) {
                try {
                    // 4. Exchange code for tokens
                    const { tokens } = await oauth2Client.getToken(code);
                    console.log('\n--- CREDENTIALS GENERATED ---');
                    console.log('Add the following to your .env file:\n');
                    console.log(`GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);

                    if (!tokens.refresh_token) {
                        console.warn('\nWARNING: No refresh_token returned. Did you already authorize? Go to your Google Account permissions and revoke access to this app, then try again.');
                    }

                    console.log('\n(Access Token for debug: ' + tokens.access_token?.substring(0, 10) + '...)');
                    process.exit(0);
                } catch (err) {
                    console.error('Error retrieving access token', err);
                    process.exit(1);
                }
            }
        }
    });

    server.listen(3000, () => {
        console.log('\nListening on http://localhost:3000/oauth2callback for response...');
    });
}

main().catch(console.error);
