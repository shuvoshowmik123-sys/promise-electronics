# Google Drive Backup — Resume Checklist

Last stopped: OAuth tokens generated, but refresh token has 7-day expiry.

## Before resuming — do this first (5 min)

1. Go to console.cloud.google.com
2. APIs & Services → OAuth consent screen
3. Click "Publish App" — removes 7-day limit. No Google review needed for drive.file scope.
4. Go back to developers.google.com/oauthplayground
5. Gear → use your own credentials → same Client ID + Secret
6. Scope: https://www.googleapis.com/auth/drive.file → Authorize → Exchange → copy new refresh_token

## .env lines to add when done

> Never paste real credential values into this file. It is tracked in git.
> Copy them straight into `.env` (gitignored) or the Render dashboard instead.

```
GOOGLE_CLIENT_SECRET=<from Google Cloud Console — do not commit>
GOOGLE_REFRESH_TOKEN=<new permanent token from above>
BACKUP_ENCRYPTION_PASSWORD=<strong passphrase — do not commit>
GOOGLE_DRIVE_BACKUP_FOLDER_ID=<folder ID from drive.google.com/drive/folders/XXXXX>
```

## Verify working

After server restart, check console for:
  [Backup Scheduler] Started — will run at 02:00 daily

Then trigger manual backup from admin panel → check Drive folder for .bak.enc file.
