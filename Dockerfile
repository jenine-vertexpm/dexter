# Stage 1: install dependencies and build the static site into /app/dist
FROM node:22.23.4-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the built files with nginx. Nothing from stage 1 except dist/ ends up here.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
COPY nginx.conf /etc/nginx/conf.d/default.conf
# The security headers, included by every location in nginx.conf. Kept outside conf.d/, because
# nginx loads every .conf file in conf.d/ on its own, and this file must only be included.
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Non-root nginx user from the base image (made explicit)
USER 101
EXPOSE 8080
