# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
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
