# Node/TS mirror — order confirmation flow

Компактный срез того же домена, что и Python-backend, на Node 24 + TypeScript + Hono.
Цель — показать перенос инженерного подхода: слои, JWT/RBAC, валидация, идемпотентность,
аудит, единый формат ошибок. Это **не** второй продакшн-сервис и не попытка переписать
FastAPI-монолит.

## Запуск

```bash
cd node-service
npm install
npm run build     # tsc --noEmit, strict
npm test          # node:test, 3 сценария
npm start         # http://127.0.0.1:3100
```

Node 22.18+ исполняет `.ts` нативно (type stripping), поэтому отдельный сборщик для
запуска не нужен; `build` — это строгая проверка типов.

Демо-доступы: `admin / admin123`, `manager / manager123`.
JWT-секрет: `JWT_SECRET` (по умолчанию dev-значение), TTL 1 час.

## API

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| GET | `/health` | — | liveness |
| POST | `/auth/login` | — | JWT + роль |
| GET | `/inventory` | any | остатки (seed: 3 товара) |
| GET | `/orders` | any | admin — все, manager — только свои |
| POST | `/orders` | admin/manager | создать заявку |
| POST | `/orders/:id/confirm` | admin/manager | списать остаток, аудит |
| POST | `/orders/:id/cancel` | admin/manager | вернуть остаток, причина обязательна |
| GET | `/audit` | admin | журнал операций |

Пример (curl):

```bash
TOKEN=$(curl -s localhost:3100/auth/login -H 'content-type: application/json' \
  -d '{"login":"admin","password":"admin123"}' | jq -r .access_token)

curl -s localhost:3100/orders -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"productId":1,"qty":2,"customerName":"Иван"}'
curl -s -X POST localhost:3100/orders/1/confirm -H "authorization: Bearer $TOKEN"
curl -s -X POST localhost:3100/orders/1/confirm -H "authorization: Bearer $TOKEN"  # idempotent: true
```

Windows/PowerShell:

```powershell
$login = Invoke-RestMethod -Method Post http://127.0.0.1:3100/auth/login `
  -ContentType 'application/json' -Body '{"login":"admin","password":"admin123"}'
$h = @{ Authorization = "Bearer $($login.access_token)" }
Invoke-RestMethod http://127.0.0.1:3100/orders -Headers $h
Invoke-RestMethod -Method Post http://127.0.0.1:3100/orders/1/confirm -Headers $h
```

## Слои

```
src/http.ts        Hono routes, Zod-валидация, единый onError
src/auth.ts        JWT verify + requireRole middleware
src/services/      OrderService (домен), AuditService
src/store.ts       in-memory repository: products, orders, audit
src/domain.ts      типы домена
```

- **RBAC** проверяется middleware; object-level доступ — в `OrderService.accessibleOrder`.
- **Идемпотентность**: повторный confirm возвращает `{ idempotent: true }` и не списывает остаток.
- **Атомарность**: в одном Node-процессе confirm меняет заказ и остаток синхронно, без `await`
  между проверкой и записью; в многопроцессном варианте это был бы `UPDATE ... WHERE deducted = false`
  в транзакции БД (как в Python-версии).
- **Ошибки**: `{ "error": { "code", "message" } }`, коды 400/401/403/404/409/500.
- **Хранилище in-memory** осознанно: срез про поток и правила, а не про персистентность.
  При развитии — PostgreSQL + repository-интерфейс без изменения сервиса.

## Тесты

`npm test` — 3 сценария:
1. confirm списывает остаток один раз, повтор идемпотентен, аудит содержит одну запись списания;
2. 401 без токена, 403 на чужую заявку и на `/audit` для manager;
3. Zod-валидация (qty=0 → 400), oversell → 409, cancel возвращает остаток ровно один раз.
