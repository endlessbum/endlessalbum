# ---------- Base ----------
FROM node:20-alpine AS base
WORKDIR /app

# ---------- Dependencies ----------
FROM base AS deps
# Копируем только файлы манифестов для кэширования слоёв
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- Builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Собираем клиент (vite) и сервер (esbuild)
RUN npm run build

# ---------- Production dependencies ----------
FROM base AS prod-deps
COPY package.json package-lock.json* ./
# Только production-зависимости для финального образа
RUN npm ci --omit=dev

# ---------- Runner ----------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=5000

# Создаём непривилегированного пользователя
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 app

# Копируем собранный код и production-зависимости
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Папка для загружаемых файлов (uploads)
COPY --from=builder /app/public ./public

# Права на папку uploads
RUN mkdir -p /app/public/uploads && chown -R app:nodejs /app/public

USER app

EXPOSE 5000

# Healthcheck для оркестраторов (Docker, Render, K8s)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1

CMD ["npm", "start"]