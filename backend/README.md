# Backend сервиса планирования производства

Node.js/TypeScript API для приложения, выросшего из HTML-прототипа планировщика: цеха → ресурсы →
справочник технологических операций → модификации изделия → проекты → заказы → авторасчёт графика
с учётом календаря смен, ручных закреплений и приоритетов.

Реально собран, протестирован против настоящей PostgreSQL и проверен сквозными сценариями
(см. раздел «Что уже проверено» ниже) — это не шаблон «на веру», а рабочий код.

## Стек

- **Node.js 20 + TypeScript** (Express 5)
- **PostgreSQL** + **Drizzle ORM** — выбран вместо Prisma осознанно: Prisma требует скачивания
  бинарного движка при каждой генерации клиента, что периодически вызывает проблемы в закрытых
  сетях/CI. Drizzle — чистый TypeScript, без бинарных зависимостей, с полноценными миграциями.
- **JWT** для авторизации, **bcrypt** для паролей, **zod** для валидации входных данных
- **Docker** — многоступенчатая сборка для продакшена

## Роли доступа

| Роль | Права |
|---|---|
| `ADMIN` | Полный доступ, включая создание пользователей |
| `DISPATCHER` (диспетчер) | Проекты, заказы, срочные заказы, ручное закрепление операций на графике |
| `NORMIROVSHIK` (нормировщик) | Справочник операций, нормы, модификации изделия, замеры времени |
| `SHOP_MASTER` (мастер цеха) | Видит график; может закреплять/откреплять операции **только в своём цехе** |

Все роли видят общий график (`GET /api/schedule`) и справочники на чтение.

## Архитектура вычисления графика

Расписание **не хранится** в базе как отдельная таблица — только заказы с их операциями,
ручными закреплениями (`pinnedStart` / `pinnedResourceId` на операции) и календарь смен цеха.
При каждом запросе `GET /api/schedule` сервис `scheduling.service.ts`:

1. Разбивает операции на закреплённые вручную и свободные
2. Свободные сортирует по приоритету → сроку проекта → порядку внутри заказа
3. Жадно раскладывает каждую: `start = max(когда освободится ресурс, когда закончилась предыдущая
   операция этого же заказа)`, попутно наматывая рабочие часы по календарю цеха (пропуская ночи/выходные,
   с учётом `alwaysOn` для круглосуточных ресурсов) и обходя уже занятые закреплённые интервалы

Это гарантирует, что график всегда отражает текущее состояние данных — без риска рассинхронизации
между «сохранённым» и «настоящим» расписанием.

## Структура проекта

```
src/
  db/
    schema.ts        — таблицы Drizzle (10 таблиц, все связи через FK)
    client.ts         — подключение к Postgres (pg Pool)
    seed.ts           — демо-данные: 2 цеха, 8 ресурсов, 23 операции, 2 модификации, 4 проекта, 5 заказов, 5 пользователей
    migrate.ts        — применение миграций в продакшене (без drizzle-kit CLI)
  middleware/
    auth.ts           — requireAuth, requireRole, scopeToOwnShop
    errorHandler.ts
  modules/
    auth/             — POST /login, POST /users (только ADMIN), GET /me
    shops/            — цеха и их календарь смен
    resources/        — участки/бригады внутри цеха
    catalog/          — справочник технологических операций (нормы)
    measurements/     — замеры времени нормировщиком + применение среднего как нормы
    modifications/    — шаблоны наборов операций
    projects/         — проекты (клиент/объект/срок)
    orders/           — заказы, срочные заказы, ручное закрепление операций
    schedule/         — scheduling.service.ts (алгоритм) + GET /api/schedule
drizzle/              — сгенерированные SQL-миграции (проверены в бою)
```

## API — краткий справочник

Все запросы (кроме `/api/auth/login`) требуют заголовок `Authorization: Bearer <token>`.

```
POST   /api/auth/login                              { email, password } -> { token, user }
POST   /api/auth/users                     [ADMIN]   создать пользователя
GET    /api/auth/me

GET    /api/shops
POST   /api/shops                          [ADMIN,DISPATCHER]
PATCH  /api/shops/:id                      [ADMIN,DISPATCHER]   { workStart, workEnd, workDays }
DELETE /api/shops/:id                      [ADMIN,DISPATCHER]

GET    /api/resources?shopId=...
POST   /api/resources                      [ADMIN,DISPATCHER]
PATCH  /api/resources/:id                  [ADMIN,DISPATCHER]   (в т.ч. перенос в другой цех через shopId)
DELETE /api/resources/:id                  [ADMIN,DISPATCHER]

GET    /api/catalog                                  включает normHours и последние измерения
POST   /api/catalog                        [ADMIN,NORMIROVSHIK]
PATCH  /api/catalog/:id                    [ADMIN,NORMIROVSHIK]
DELETE /api/catalog/:id                    [ADMIN,NORMIROVSHIK]

POST   /api/measurements                   [ADMIN,NORMIROVSHIK]  { catalogOperationId, minutes }
GET    /api/measurements/by-operation/:id
POST   /api/measurements/by-operation/:id/apply-average  [ADMIN,NORMIROVSHIK]

GET    /api/modifications                            включает totalHours
POST   /api/modifications                  [ADMIN,NORMIROVSHIK]  { name, items:[{catalogOperationId,qty}] }
DELETE /api/modifications/:id              [ADMIN,NORMIROVSHIK]

GET    /api/projects
POST   /api/projects                       [ADMIN,DISPATCHER]    { name, client, object, deadlineHours }
PATCH  /api/projects/:id                   [ADMIN,DISPATCHER]
DELETE /api/projects/:id                   [ADMIN,DISPATCHER]

GET    /api/orders
POST   /api/orders                         [ADMIN,DISPATCHER]    { projectId, priority, modificationId } или { ..., items:[{catalogOperationId,qty}] }
POST   /api/orders/urgent-quick            [ADMIN,DISPATCHER]    случайные операции из справочника, priority=URGENT
DELETE /api/orders/:id                     [ADMIN,DISPATCHER]
PATCH  /api/orders/operations/:opId/pin    [ADMIN,DISPATCHER,SHOP_MASTER*]  { pinnedStart, pinnedResourceId? }
DELETE /api/orders/operations/:opId/pin    [ADMIN,DISPATCHER,SHOP_MASTER*]  снять закрепление

GET    /api/schedule                                 вычисленный график: resources, shops, operations (со start/end/segments)
```
`*` SHOP_MASTER может закреплять только операции, чей текущий и целевой ресурс относятся к его цеху (`user.shopId`).

## Что уже проверено (не просто написано — прогнано против реальной PostgreSQL)

- Миграции накатываются на чистую БД (10 таблиц, все FK на месте)
- `npm run build` компилируется без ошибок TypeScript
- Полный цикл: логин → создание заказа из модификации (21 операция) → расчёт графика → ручное
  закрепление операции → повторный расчёт видит закрепление
- Замер времени нормировщиком (2 замера) → применение среднего как новой нормы
- Разграничение прав: диспетчер получает 403 на попытку редактировать справочник; мастер чужого
  цеха получает 403 на попытку закрепить операцию не в своём цехе; мастер своего цеха — 200
- Скомпилированные `dist/db/migrate.js` и `dist/db/seed.js` (именно то, что запустится в контейнере)
  проверены отдельно на чистой базе

## Локальный запуск

```bash
cp .env.example .env          # поправьте JWT_SECRET на случайную строку
docker compose up -d postgres
npm install
npm run db:migrate            # применить миграции (drizzle-kit, локально)
npm run db:seed               # демо-данные + пользователи (пароль — из .env)
npm run dev                   # http://localhost:3000
```

Либо полностью в Docker: `docker compose up -d --build`, затем один раз
`docker compose exec app node dist/db/migrate.js` и опционально `docker compose exec app node dist/db/seed.js`.

## Деплой на Timeweb Cloud

### 1. База данных
Создайте **Timeweb Cloud Managed PostgreSQL** (отдельный сервис в панели Timeweb Cloud, не часть
App Platform) — версии 15/16. Из панели БД возьмите host, port, user, password, dbname и соберите
`DATABASE_URL=postgresql://user:password@host:port/dbname`. Managed PostgreSQL Timeweb Cloud обычно
требует TLS — поставьте `DATABASE_SSL=true`.

### 2. Приложение (Timeweb Cloud Apps)
1. Залейте этот код в Git-репозиторий (GitHub/GitLab/Bitbucket) — Timeweb Cloud Apps разворачивает
   именно из репозитория.
2. В панели Timeweb Cloud создайте App → подключите репозиторий.
3. Выберите **сборку по Dockerfile** (он уже есть в корне проекта) — это надёжнее автоопределения
   Node.js-приложения, так как явно фиксирует шаги сборки и миграций.
4. Задайте переменные окружения приложения:
   - `DATABASE_URL` — строка подключения к вашей Managed PostgreSQL
   - `DATABASE_SSL=true`
   - `JWT_SECRET` — сгенерируйте: `openssl rand -base64 48`
   - `JWT_EXPIRES_IN=12h`
   - `PORT=3000` (или тот, что укажете как порт приложения в панели)
   - `AUTO_MIGRATE=true` — **только для первого деплоя**, чтобы таблицы создались автоматически при
     старте контейнера без доступа к консоли. После первого успешного запуска верните `false` и
     дальше применяйте новые миграции через передеплой с `AUTO_MIGRATE=true` на одну итерацию,
     либо через `db:migrate:deploy`, если у панели появится доступ к выполнению команд в контейнере.
5. Запустите деплой. Проверьте `GET /health` на выданном Timeweb Cloud домене — должен вернуть `{"status":"ok"}`.
6. Разово выполните сидирование демо-данных (если нужно) — самый надёжный способ без shell-доступа:
   временно добавьте отдельный build-endpoint не стоит; вместо этого либо используйте
   `AUTO_MIGRATE` + подключение локального `psql`/DBeaver к Managed PostgreSQL по внешнему адресу и
   выполните `npm run db:seed` **с локальной машины**, указав в `.env` продакшен `DATABASE_URL`.
7. Создайте первого администратора: если сид не запускали — сделайте `POST /api/auth/users` нельзя
   (там уже требуется токен ADMIN, замкнутый круг) — для самого первого пользователя воспользуйтесь
   `db:seed` (создаёт admin/dispatcher/normirovshik/shop_master с паролем из `SEED_ADMIN_PASSWORD`),
   а затем через `/api/auth/users` заведите остальных с настоящими паролями и удалите демо-пользователей.

### 3. После деплоя — обязательно
- Смените пароли демо-пользователей или удалите их и создайте настоящих через `/api/auth/users`
- Смените `JWT_SECRET` на уникальный (не используйте значение из примера)
- Проверьте, что `DATABASE_SSL=true` и панель Timeweb Cloud действительно требует TLS — иначе
  подключение к Managed PostgreSQL может не установиться

## Известные упрощения (осознанные, как и в HTML-прототипе)

- Один расчётный календарь на цех (без разбивки на 2-3 смены в день) — расширяется добавлением
  таблицы `shifts` со ссылкой на `shopId` без изменения остальной архитектуры
- Нет проверки конфликта двух вручную закреплённых операций друг с другом на одном ресурсе
- Секундомер замера времени — логика на фронтенде (само тиканье), backend только принимает готовый
  результат замера в минутах — так секундомер переживает кратковременные обрывы связи
