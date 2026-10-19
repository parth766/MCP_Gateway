FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4003

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

USER node

EXPOSE 4003

CMD ["node", "src/index.js"]
