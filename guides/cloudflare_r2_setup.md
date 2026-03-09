# Cloudflare R2 Setup Guide

This guide will help you set up 10GB of free, secure cloud object storage for your backups.

## Step 1: Create Account
1.  Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2.  Sign up with your email (no credit card needed for the free account initially, but R2 might ask for one to prevent abuse - you won't be charged unless you exceed 10GB).

## Step 2: Enable R2
1.  In the dashboard sidebar, click **R2**.
2.  If asked, enable the R2 subscription (select the Free tier).

## Step 3: Create a Bucket
1.  Click **Create Bucket**.
2.  Name it: `promise-backups-prod` (or similar).
3.  Click **Create Bucket**.
4.  **Important:** In the bucket settings, find "Location" or "Jurisdiction" if you have data residency requirements (usually "Automatic" is fine).

## Step 4: Generate API Tokens (Crucial)
1.  Go back to the main **R2** dashboard page.
2.  On the right side, click **Manage R2 API Tokens**.
3.  Click **Create API Token**.
4.  **Token Name:** `backup-system-token`.
5.  **Permissions:** Select **Admin Read & Write**.
6.  Click **Create API Token**.

## Step 5: Copy Credentials
You will see a screen with your keys. **DO NOT CLOSE IT** until you copy these:

1.  **Access Key ID:** (e.g., `324234...`)
2.  **Secret Access Key:** (e.g., `2342345...`)
3.  **Endpoint:** (It looks like `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`)

## Step 6: Update .env
Add these to your project's `.env` file:

```env
R2_ACCESS_KEY_ID="<your_access_key_id>"
R2_SECRET_ACCESS_KEY="<your_secret_access_key>"
R2_BUCKET_NAME="promise-backups-prod"
R2_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
```
