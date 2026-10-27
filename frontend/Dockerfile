FROM node:22-alpine AS base

WORKDIR /usr/agentdesk/frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

FROM base AS dev

EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM base AS build

ARG VITE_API_MODE=mock
ARG VITE_API_BASE_URL=http://localhost:8080/api/v1
ENV VITE_API_MODE=${VITE_API_MODE} \
    VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/agentdesk/frontend/dist /usr/share/nginx/html

EXPOSE 80
