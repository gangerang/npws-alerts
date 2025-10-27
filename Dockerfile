# Multi-stage build for NPWS Alerts application
# Stage 1: Build TypeScript application
FROM node:20-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

# Install runtime dependencies: sqlite for better-sqlite3, curl for healthcheck
RUN apk add --no-cache sqlite curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /build/dist ./dist

# Copy public static files
COPY public ./public

# Copy manual park mappings CSV
COPY data/manual-park-mappings.csv ./data/

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# Create data directory for SQLite database with proper permissions
RUN mkdir -p /app/data && \
    chmod 777 /app/data

# Expose web server port
EXPOSE 3000

# Set environment defaults
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/npws-alerts.db \
    PORT=3000

# Health check for web server using curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/stats || exit 1

# Run startup script that launches both scheduler and web server
CMD ["./start.sh"]
