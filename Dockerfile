# ==========================================
# Stage 1: Build the React client
# ==========================================
FROM node:22-alpine AS client-builder

WORKDIR /app/client

# Copy package manifests and install dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client source code
COPY client/ ./

# Build production assets (will compile to /app/client/dist)
RUN npm run build

# ==========================================
# Stage 2: Set up the Express server
# ==========================================
FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

# Copy server package manifests and install production dependencies
COPY server/package*.json ./server/
RUN npm ci --prefix server --only=production

# Copy server source code
COPY server/ ./server/

# Copy compiled frontend assets from client-builder
COPY --from=client-builder /app/client/dist ./client/dist

# Create storage directory for local SQLite database and uploads
RUN mkdir -p /app/data/uploads

# Set environment variables for storage locations
ENV DATABASE_PATH=/app/data/database.sqlite
ENV UPLOADS_PATH=/app/data/uploads
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Run the server
CMD ["node", "server/server.js"]
