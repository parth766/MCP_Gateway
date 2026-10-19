FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app

USER node

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "src/index.js"]
