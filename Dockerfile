# ---------- Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --ignore-scripts && \
    npx prisma generate

COPY . .

RUN npm run build

# ---------- Production ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Dependências de produção + prisma CLI para migrations no start
COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev --ignore-scripts && \
    npm install prisma@6.19.3 --save-dev --ignore-scripts && \
    npx prisma generate && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

# Non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "dist/main.js"]