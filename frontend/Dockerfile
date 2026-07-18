# Многоступенчатая сборка: сначала собираем Vite-приложение, затем отдаём готовые файлы через nginx.
# Это надёжнее native-типа "Frontend" в панели Timeweb, если там неясно, как трактуется
# "Директория сборки" — здесь раздача файлов прописана явно, без угадывания.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL берётся из .env.production, который уже лежит в репозитории — специально
# НЕ передаём его через Docker ARG/ENV: даже пустое значение оттуда перебивает .env-файл
# более высоким приоритетом в Vite, что и было причиной "Failed to fetch" в проде.
# Если понадобится другой адрес backend — просто отредактируйте .env.production перед сборкой.
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
