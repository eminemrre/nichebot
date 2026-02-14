FROM node:18-alpine

WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm ci --only=production

# Source
COPY . .

# Data volume
RUN mkdir -p /app/data

VOLUME ["/app/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "console.log('ok')" || exit 1

CMD ["node", "src/index.js"]
