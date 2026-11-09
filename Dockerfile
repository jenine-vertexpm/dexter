# Stage 1: install dependencies and build the static site into /app/dist
FROM node:22.23.4-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the built files with nginx. Nothing from stage 1 except dist/ ends up here.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
# Install Alpine's latest security fixes for the system packages. The base image is only rebuilt
# now and then, and Alpine often ships fixes in between (M4 H8: the base image of 2026-10-19 had
# 1 critical and 9 high fixable findings). Root is needed only for this one step; nginx itself
# runs as the unprivileged user below. CI scans the result with Trivy on every build.
USER root
RUN apk upgrade --no-cache
COPY nginx.conf /etc/nginx/conf.d/default.conf
# The security headers, included by every location in nginx.conf. Kept outside conf.d/, because
# nginx loads every .conf file in conf.d/ on its own, and this file must only be included.
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Non-root nginx user from the base image (made explicit)
USER 101
EXPOSE 8080
