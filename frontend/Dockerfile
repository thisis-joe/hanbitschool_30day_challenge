FROM node:24-alpine AS build
RUN npm install --global pnpm@11.25.0
WORKDIR /source
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build
FROM nginx:1.28-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /source/dist /usr/share/nginx/html
EXPOSE 80
