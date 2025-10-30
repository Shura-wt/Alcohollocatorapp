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

# 2) Runtime stage: serve static files with Nginx (TLS handled by upstream reverse proxy)
FROM nginx:1.27-alpine

# Copy the compiled app to Nginx web root
COPY --from=build /app/build /usr/share/nginx/html

# Provide Nginx configuration (SPA fallback, gzip, caching)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP only (reverse proxy will provide HTTPS)
EXPOSE 80

# Nginx starts by default (CMD provided by base image)