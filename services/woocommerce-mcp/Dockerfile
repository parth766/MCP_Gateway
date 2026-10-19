FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4001

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

# Run as non-root user for security hardening
USER node

EXPOSE 4001

CMD ["node", "src/index.js"]
