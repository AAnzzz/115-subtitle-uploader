FROM golang:1.24-alpine AS uploader-builder
RUN go install github.com/orzogc/fake115uploader@latest

FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app/backend
RUN apk add --no-cache ca-certificates

COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=uploader-builder /go/bin/fake115uploader /usr/local/bin/fake115uploader

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/backend/data \
    FRONTEND_DIST_DIR=/app/backend/public

EXPOSE 3000
CMD ["node", "dist/index.js"]
