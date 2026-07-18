# Многоступенчатая сборка: сначала собираем Vite-приложение, затем отдаём готовые файлы через nginx.
# Это надёжнее native-типа "Frontend" в панели Timeweb, если там неясно, как трактуется
# "Директория сборки" — здесь раздача файлов прописана явно, без угадывания.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL встраивается в бандл на этапе сборки, поэтому либо используйте .env.production
# (уже лежит в репозитории), либо передайте свой адрес через --build-arg при сборке образа:
#   docker build --build-arg VITE_API_URL=https://ваш-backend/api -t frontend .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
