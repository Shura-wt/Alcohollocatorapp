# syntax=docker/dockerfile:1

# 1) Build stage: compile the Vite app
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (use ci for reproducible installs)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the project and build
COPY . .
RUN npm run build

# 2) Runtime stage: serve static files with Caddy (automatic HTTPS)
FROM caddy:2.8-alpine

# Copy the compiled app to Caddy's web root
COPY --from=build /app/build /usr/share/caddy

# Provide Caddy configuration (domain + TLS + SPA fallback)
COPY Caddyfile /etc/caddy/Caddyfile

# Expose HTTP/HTTPS
EXPOSE 80
EXPOSE 443

# Caddy is the default entrypoint for this image