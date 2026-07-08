# Многоступенчатая сборка: сначала собираем TypeScript, затем кладём только прод-зависимости и dist.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Копируем всё, что нужно для работы
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts 2>/dev/null || true
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts

# Если у вас есть миграции, они должны быть в папке drizzle
# Убедитесь, что папка существует (даже если пустая)
RUN mkdir -p ./drizzle

EXPOSE 3000
CMD ["node", "dist/index.js"]
