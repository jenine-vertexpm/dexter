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
# Remove the base image's own site (nginx's welcome page). Ours is written from a template at start,
# so if that ever failed, nothing but Dexter could be served.
RUN apk upgrade --no-cache && rm /etc/nginx/conf.d/default.conf

# Runtime configuration (M5 plan D32): the image has no environment's values. When the container
# starts, 05-dexter-config.envsh checks DEXTER_API_BASE_URL and DEXTER_ENVIRONMENT (and stops the
# container if they're missing or invalid), then the base image turns the templates into
# /etc/nginx/conf.d/default.conf and security-headers.inc. --chmod: the script must be executable,
# and Git on Windows doesn't keep that flag.
COPY --chmod=755 docker/05-dexter-config.envsh /docker-entrypoint.d/05-dexter-config.envsh
COPY nginx/default.conf.template nginx/security-headers.inc.template /etc/nginx/templates/
# Fill in only variables whose names start with DEXTER_ (a fixed image setting, not configuration)
ENV NGINX_ENVSUBST_FILTER=^DEXTER_

COPY --from=build /app/dist /usr/share/nginx/html
# Non-root nginx user from the base image (made explicit)
USER 101
EXPOSE 8080
