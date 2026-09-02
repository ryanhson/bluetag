FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/bluetag.db

EXPOSE 3000
CMD ["node", "src/index.js"]
