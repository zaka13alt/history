# 
FROM node:20-alpine AS node-builder
WORKDIR /app

# 
COPY node/package*.json ./
RUN npm ci --only=production

# 
COPY node/index.js ./

# 
FROM caddy:2.11-alpine

# 
RUN apk add --no-cache nodejs npm

WORKDIR /app

# 
COPY --from=node-builder /app /app

#
COPY Caddyfile /etc/caddy/Caddyfile

# 
COPY . /usr/share/caddy/

# 
RUN rm -rf /usr/share/caddy/node /usr/share/caddy/Caddyfile /usr/share/caddy/Dockerfile

# 
EXPOSE 443

# 
CMD node /app/index.js & caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
