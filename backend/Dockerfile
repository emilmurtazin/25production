# Многоступенчатая сборка: сначала собираем TypeScript, затем кладём только прод-зависимости и dist.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm ci

# Копируем всё из сборки
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=build /app/src/db/seed.ts ./src/db/seed.ts

# Копируем сертификат
COPY root.crt /root/.cloud-certs/root.crt
ENV PGSSLROOTCERT=/root/.cloud-certs/ca.crt

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
