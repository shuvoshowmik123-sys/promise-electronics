# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
COPY .npmrc ./
RUN npm ci

# Copy source code
COPY . .

# ---------------------------------------------------------------------------
# Firebase browser configuration, handed in as Docker build arguments.
#
# Vite replaces import.meta.env.VITE_* with literal values AT BUILD TIME. A
# Docker stage does not inherit the host environment, so unless a variable is
# declared as ARG here it simply does not exist while `npm run build` runs, and
# Vite compiles the reference to `undefined`.
#
# That is exactly what happened: VITE_FIREBASE_VAPID_KEY was set correctly in
# Render, the code read it correctly, and the shipped bundle still contained
# `const VAPID_KEY = void 0` — so isWebPushConfigured() was always false and the
# admin notification toggle hid itself with no way to turn push on.
#
# ONLY these seven belong here. Every one is public by design: Vite inlines them
# into JavaScript that is served to every visitor, so they are already readable
# by anyone. Firebase secures projects with API restrictions and security rules,
# not by hiding this configuration.
#
# NEVER add a server secret as an ARG. Build arguments are recoverable from image
# layers, so passing SESSION_SECRET, DATABASE_URL, GOOGLE_CLIENT_SECRET,
# BACKUP_ENCRYPTION_PASSWORD, or the R2/SMS keys this way would publish them.
# Those stay runtime-only environment variables and must never appear below.
# ---------------------------------------------------------------------------
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY

# Report which build variables arrived, by NAME and set/not-set only — never a
# value. Diagnosing this took five wrong guesses precisely because the build was
# silent about what it could see; a build that says so costs one line.
RUN echo "── Vite build variables visible to this stage ──" && \
    for v in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \
             VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID \
             VITE_FIREBASE_APP_ID VITE_FIREBASE_VAPID_KEY; do \
      eval "val=\$$v"; \
      if [ -n "$val" ]; then echo "  $v: SET (${#val} chars)"; else echo "  $v: MISSING"; fi; \
    done && echo "───────────────────────────────────────────────"

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY .npmrc ./
RUN npm ci --omit=dev

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables
# Set environment variables
ENV NODE_ENV=production
ENV PORT=5083

# Expose the port
EXPOSE 5083

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5083/api/health || exit 1

# Start the application
# Note: For persistent storage, mount a volume to /app/sqlite.db
CMD ["node", "dist/index.cjs"]
