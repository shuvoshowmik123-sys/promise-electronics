# Frontend / Backend Separation — Deploy Guide

## Architecture after separation

```
Browser → Vercel (frontend SPA)
             ↓ HTTPS API calls
        Render (Express backend)
             ↓
        Neon PostgreSQL (DB)
```

---

## Backend — Render

### Build command
```
npm run build
```

### Start command
```
node dist/index.cjs
```

### Environment variables to set on Render

```
NODE_ENV=production
DATABASE_URL=<neon connection string>
BRAIN_DATABASE_URL=<brain neon connection string>
SESSION_SECRET=<32+ random chars>
FRONTEND_URL=https://<your-vercel-app>.vercel.app

MESSENGER_VERIFY_TOKEN=<same as Meta console>
MESSENGER_PAGE_ACCESS_TOKEN=<from Meta>
FACEBOOK_PAGE_ID=<your page ID>

WHATSAPP_ACCESS_TOKEN=<from Meta>
WHATSAPP_PHONE_NUMBER_ID=<from Meta>
WHATSAPP_VERIFY_TOKEN=<from Meta>

GEMINI_API_KEY=<your key>
GROQ_API_KEY=<your key>

GOOGLE_CLIENT_ID=<from Google Console>
GOOGLE_CLIENT_SECRET=<from Google Console>
GOOGLE_REFRESH_TOKEN=<from OAuth Playground>
GOOGLE_DRIVE_BACKUP_FOLDER_ID=<folder ID>
BACKUP_ENCRYPTION_PASSWORD=<32+ random chars>

IMAGEKIT_PUBLIC_KEY=<your key>
IMAGEKIT_PRIVATE_KEY=<your key>
IMAGEKIT_URL_ENDPOINT=<your endpoint>
```

### Health check (Render requires this)
```
GET /health
```
Set in Render dashboard → Health Check Path: `/health`

---

## Frontend — Vercel

### Build command
```
npm run build:frontend
```

### Output directory
```
dist/public
```

### Environment variables to set on Vercel

```
VITE_API_URL=https://<your-render-app>.onrender.com
```

That's the only env var the frontend needs.

---

## What happens automatically

| Scenario | Behavior |
|---|---|
| `VITE_API_URL` not set | Frontend uses relative `/api/` paths — same-origin |
| `VITE_API_URL` set | Fetch interceptor rewrites all `/api/*` to absolute URL |
| `FRONTEND_URL` not set | Session cookie `sameSite: lax` — same-origin |
| `FRONTEND_URL` set | Session cookie `sameSite: none` + `secure: true` — cross-origin |

---

## CORS

Backend already allows:
- `localhost` (dev)
- `*.vercel.app`
- `promiseelectronics.com`
- `FRONTEND_URL` env var value
- Any domain in `EXTRA_ALLOWED_ORIGINS` (comma-separated)

---

## Dev mode (unchanged)

```
npm run dev
```

Vite proxy handles `/api/*` → `localhost:5083`. Nothing changes for local development.
