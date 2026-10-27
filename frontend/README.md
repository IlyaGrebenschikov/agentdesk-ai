# AgentDesk Frontend

Frontend MVP для AgentDesk — low-code редактора AI-workflow с упором на отладку исполнения. Это самостоятельное React-приложение: его можно запускать до готовности backend, разрабатывать интерфейс и подключать реальные ручки FastAPI по одной.

## Что уже есть

- Визуальный редактор на React Flow: добавление узлов, перемещение, соединение, удаление, настройка конфигурации.
- Типы узлов MVP: `Input`, `LLM`, `AI Agent`, `Tool`, `Condition`, `Output`.
- Валидация графа на клиенте: обязательные Input/Output, дубли ID, битые связи, базовые настройки узлов, циклы.
- Сохранение черновика и создание workflow.
- Диалог запуска с JSON input.
- Debugger: состояние каждого узла, input/output snapshot, duration, usage, стоимость, trace events, ошибка, stage, traceback и флаг retryability.
- Страница Runs & traces, каталог инструментов, шаблоны и базовые настройки.
- Демонстрационный неуспешный запуск с ошибкой `TOOL_TIMEOUT`, чтобы отладчик был полезен при первом открытии.
- Mock API с сохранением данных в `localStorage`.
- Полные mock-backed auth flows: вход, регистрация, выход, восстановление пароля, демонстрационный аккаунт и сохранение сессии.
- Плавные переходы графа между программными позициями, отдельный стиль перетаскивания без задержки за курсором, плавные состояния узлов и соединений.
- Отдельные HTTP API adapters для подключения FastAPI без переписывания компонентов.

Визуальные поля и конфигурация узлов уже редактируются. Реальные LLM-вызовы, инструменты, выполнение workflow, retries и трассировку должен предоставлять backend. В mock-режиме они симулируются для демонстрации UX.

## Запуск

Требуется Node.js 20.19+ или 22.12+ и npm (Vite 8).

```bash
npm install
cp .env.example .env
npm run dev
```

Открой URL, который напечатает Vite, обычно `http://localhost:5173`.

Сборка и проверка TypeScript:

```bash
npm run typecheck
npm run build
npm run preview
```

## Режимы работы

По умолчанию приложение запускается в `mock`-режиме и не требует backend.

```env
VITE_API_MODE=mock
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Для обращения к FastAPI переключи режим:

```env
VITE_API_MODE=api
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

После изменения `.env` перезапусти Vite. В UI режим виден в верхней панели как `DEMO MODE` или `API MODE`.

Демо-учётные записи и сессия хранятся локально в браузере. По умолчанию вход доступен с `demo@agentdesk.dev` / `demo1234`. Регистрация создаёт отдельного mock-пользователя; восстановление пароля имитируется и не отправляет письмо. Это только frontend-заглушки, не production-аутентификация. Чтобы полностью сбросить демо-состояние, открой DevTools → Application → Local Storage и Session Storage и удали ключи:

- `agentdesk.mock.workflows.v1`
- `agentdesk.mock.traces.v1`
- `agentdesk.auth.mock_users.v1`
- `agentdesk.auth.session.v1` (в Local Storage или Session Storage)

## Структура

```text
src/
├── api/
│   ├── auth.ts         # mock/auth HTTP adapter, сессия и access token
│   ├── client.ts       # единый контракт API + HTTP adapter + graph mapper
│   ├── mock.ts         # локальная имитация API, runs и trace
│   ├── seed.ts         # начальный Error Analyst workflow
│   └── types.ts        # типы доменных объектов и DTO
├── components/
│   ├── AuthScreen.tsx  # вход, регистрация и восстановление пароля
│   └── WorkflowNodeView.tsx
├── engine/
│   └── validate.ts     # клиентская предварительная проверка графа
├── App.tsx             # экраны и композиция UI
├── main.tsx
└── styles.css
```

### Где подключать backend

Основная точка подключения данных workflow — `src/api/client.ts`. Все страницы обращаются к интерфейсу `AgentDeskApi` и не используют `fetch` напрямую. В mock-режиме интерфейс реализует `mockApi` из `src/api/mock.ts`; в режиме `api` — `httpApi`. Авторизация вынесена отдельно в `src/api/auth.ts`, поэтому login/register и основной API можно адаптировать независимо. Access token автоматически добавляется в Bearer-заголовок запросов основного API.

Если backend вернёт другой формат ответа или пути будут называться иначе, сначала измени только `httpApi` и функции `toApiGraph` / `fromApiGraph` в `client.ts`. Старайся не добавлять `fetch` в React-компоненты.

## Рекомендуемый порядок подключения FastAPI

### Авторизация: контракт для FastAPI

В `VITE_API_MODE=api` фронтенд ожидает следующие ручки (пути можно поменять только в `src/api/auth.ts`):

- `POST /auth/login` — `{ email, password }`
- `POST /auth/register` — `{ full_name, email, password }`
- `POST /auth/forgot-password` — `{ email }`
- `POST /auth/logout` — текущая сессия; ошибка logout не блокирует локальный выход

Для login/register ожидается JSON с `access_token` и `user` (`id`, `email`, `full_name`, `role`, опционально `avatar_url`). Также поддерживается envelope `{ data: { access_token, user } }`. Для другого формата измени `normalizeSession()` в `src/api/auth.ts`. Сессия сохраняется в Local Storage при включённом Remember me, иначе — в Session Storage. В mock-режиме начальный аккаунт: `demo@agentdesk.dev` / `demo1234`.

**Важно:** пароль в mock-режиме сохраняется в Local Storage только для локальной демонстрации. Это не реальная защита и не должно переноситься в production. В реальном backend хранение паролей, хэширование и выдача токенов должны выполняться на сервере.

### Этап 1 — чтение данных

Подключи и проверь:

- `GET /workflows`
- `GET /workflows/{workflow_id}`
- `GET /tools`
- `GET /executions`
- `GET /executions/{execution_id}/trace`

На этом этапе интерфейс уже может показывать реальные workflow, доступные инструменты и историю запусков.

### Этап 2 — редактирование

Подключи:

- `POST /workflows`
- `PUT /workflows/{workflow_id}/draft`
- `POST /workflows/validate`
- `POST /workflows/{workflow_id}/publish`

Сначала проверь сохранение и загрузку графа с одним Input и одним Output. После round-trip граф должен сохранить расположение узлов, edge handles, типы и конфигурации.

### Этап 3 — запуск и отладка

Подключи:

- `POST /workflows/{workflow_id}/executions`
- `GET /executions`
- `GET /executions/{execution_id}`
- `GET /executions/{execution_id}/trace`

`POST .../executions` желательно возвращать быстро с `202 Accepted` и DTO запуска со статусом `queued`. UI обновляет trace polling-запросом примерно раз в секунду, пока статус `queued` или `running`. Позже polling можно заменить на SSE/WebSocket, не меняя модель трассы в компонентах.

### Этап 4 — управление исполнением

Подключи:

- `POST /executions/{execution_id}/cancel`
- `POST /executions/{execution_id}/nodes/{node_id}/retry`

Повтор узла должен быть отдельной попыткой/запуском и ссылаться на исходный execution. Не перезаписывай старую ошибку или её события. Backend должен явно указывать, какие типы узлов можно безопасно повторять.

## Контракт API, ожидаемый frontend

Префикс по умолчанию: `/api/v1`. Ответы ожидаются как JSON напрямую, без обёртки вида `{ "data": ... }`. Если backend использует envelope, добавь распаковку в `request()`/`httpApi`.

### `GET /workflows`

Возвращает массив `WorkflowSummary`:

```json
[
  {
    "id": "wf_error_analyst",
    "name": "Error Analyst",
    "description": "Analyze service errors and generate an incident report.",
    "status": "draft",
    "updated_at": "2026-10-27T12:00:00Z",
    "published_version": null,
    "node_count": 6,
    "last_run_status": "failed"
  }
]
```

### `GET /workflows/{workflow_id}`

Возвращает `WorkflowDocument`: `WorkflowSummary` плюс `created_at` и `graph`.

```json
{
  "id": "wf_error_analyst",
  "name": "Error Analyst",
  "description": "Analyze service errors and generate an incident report.",
  "status": "draft",
  "updated_at": "2026-10-27T12:00:00Z",
  "created_at": "2026-10-27T11:00:00Z",
  "published_version": null,
  "node_count": 2,
  "graph": {
    "schema_version": 1,
    "nodes": [
      {
        "id": "input_1",
        "type": "input",
        "name": "Incoming request",
        "subtitle": "Input · JSON payload",
        "description": "Validate input.",
        "position": { "x": 120, "y": 180 },
        "config": { "fields": "question" }
      },
      {
        "id": "output_1",
        "type": "output",
        "name": "Final response",
        "subtitle": "Output · JSON",
        "position": { "x": 520, "y": 180 },
        "config": { "output_key": "result", "format": "json" }
      }
    ],
    "edges": [
      { "id": "e1", "source": "input_1", "target": "output_1", "type": "smoothstep" }
    ]
  }
}
```

**Почему отдельный DTO для графа:** React Flow — UI-слой. На backend сохраняются `type`, `name`, `position`, `config` и связи; состояние выделения, временный status узла и другие canvas-состояния не должны попадать в версию workflow. `client.ts` конвертирует backend graph в UI-модель и обратно.

### `POST /workflows`

Request:

```json
{ "name": "Error Analyst" }
```

Response: созданный `WorkflowDocument`.

### `PUT /workflows/{workflow_id}/draft`

Request:

```json
{
  "name": "Error Analyst",
  "graph": {
    "schema_version": 1,
    "nodes": [],
    "edges": []
  }
}
```

`graph` в API payload использует backend DTO из предыдущего раздела. В этом примере пустые массивы приведены только для иллюстрации формы запроса; реальный backend должен валидировать граф.

### `POST /workflows/validate`

Request:

```json
{ "graph": { "schema_version": 1, "nodes": [], "edges": [] } }
```

Response:

```json
{
  "valid": false,
  "checked_at": "2026-10-27T12:00:00Z",
  "issues": [
    { "code": "INPUT_REQUIRED", "message": "Add an Input node.", "severity": "error" }
  ]
}
```

Backend validation обязательна, даже если фронтенд предварительно проверяет граф. Нельзя доверять frontend validation как границе безопасности.

### `POST /workflows/{workflow_id}/publish`

Request: `{}`. Response: обновлённый `WorkflowDocument` с `status: "published"` и номером опубликованной версии.

### `POST /workflows/{workflow_id}/executions`

Request:

```json
{
  "inputs": {
    "service": "checkout-api",
    "time_range": "1h",
    "environment": "production"
  }
}
```

Response: `ExecutionSummary` со статусом `queued` или `running`. Предпочтительный HTTP status — `202 Accepted`.

### `GET /executions` и `GET /executions?workflow_id=...`

Возвращает массив `ExecutionSummary`. Для списка полезны `id`, `workflow_id`, `workflow_name`, `workflow_version`, `status`, `created_at`, `duration_ms`, `total_tokens`, `estimated_cost_usd`, `failed_node_id` и `error_message`.

### `GET /executions/{execution_id}/trace`

Возвращает:

```json
{
  "execution": {
    "id": "exec_123",
    "workflow_id": "wf_error_analyst",
    "workflow_name": "Error Analyst",
    "workflow_version": 3,
    "status": "failed",
    "trigger": "manual",
    "created_at": "2026-10-27T12:00:00Z",
    "duration_ms": 38100,
    "total_tokens": 1308,
    "estimated_cost_usd": 0.0018,
    "failed_node_id": "tool_1",
    "error_message": "Tool execution failed: timeout after 15 seconds"
  },
  "node_runs": [
    {
      "id": "nr_123",
      "node_id": "tool_1",
      "node_title": "Search logs",
      "node_kind": "tool",
      "status": "failed",
      "attempt": 2,
      "duration_ms": 31000,
      "input_snapshot": { "service": "checkout-api", "query": "error OR timeout" },
      "error": {
        "category": "timeout",
        "code": "TOOL_TIMEOUT",
        "message": "The log-search tool did not respond within 15 seconds.",
        "retryable": true,
        "stage": "tool.execute",
        "traceback": "ToolTimeout: request exceeded 15000ms"
      }
    }
  ],
  "events": [
    {
      "id": "evt_1",
      "execution_id": "exec_123",
      "node_run_id": "nr_123",
      "node_id": "tool_1",
      "timestamp": "2026-10-27T12:00:10Z",
      "level": "error",
      "event_type": "node.failed",
      "message": "Tool execution failed after retry",
      "details": { "retryable": true }
    }
  ]
}
```

Trace snapshots могут содержать чувствительные данные. Backend должен редактировать секреты до записи, ограничивать размер payload и не отдавать внутренние stack traces неавторизованным пользователям. Для LLM-узлов передавай usage и стоимость только если провайдер сообщил необходимые данные; не подставляй фиктивные значения.

### `POST /executions/{execution_id}/cancel`

Request: `{}`. Response: обновлённый `ExecutionSummary`.

### `POST /executions/{execution_id}/nodes/{node_id}/retry`

Request: `{}`. Response: новый `ExecutionSummary` для retry/replay. Если backend возвращает исходный execution, согласуй контракт и UI; по умолчанию frontend ожидает новый идентификатор запуска.

### `GET /tools`

Возвращает массив `ToolDefinition`:

```json
[
  {
    "id": "log_search",
    "name": "Search logs",
    "description": "Search service logs by query and time range.",
    "category": "Observability",
    "kind": "builtin",
    "status": "available",
    "icon": "search",
    "input_schema": { "service": "string", "query": "string", "since": "string" }
  }
]
```

## Важные детали интеграции

1. **CORS.** Разреши origin frontend, например `http://localhost:5173`, в FastAPI.
2. **Ошибки.** `request()` отображает поле `detail` или `message` из неуспешного JSON-ответа. Для форматированных ошибок Pydantic при необходимости добавь человекочитаемый mapper.
3. **Авторизация.** Auth adapter уже добавляет access token к запросам. Согласуй формат токенов и ответы login/register с FastAPI; не сохраняй API keys LLM-провайдеров в клиентском коде.
4. **Graph validation.** Клиентская валидация помогает UX, backend обязан повторить проверки при сохранении, публикации и запуске.
5. **Trace polling.** Сейчас используется polling приблизительно раз в секунду для `queued/running`. Это простой MVP; при необходимости его можно заменить на SSE.
6. **Retries.** Ошибка содержит `retryable`, но backend дополнительно должен проверять семантику узла и внешние side effects. Нельзя обещать exactly-once только за счёт UI-кнопки.
7. **Версии.** Успешный запуск должен ссылаться на immutable workflow version. Для воспроизводимой отладки backend также сохраняет фактические входы/выходы по политикам redaction.

## Ручной smoke-test

1. Запустить frontend в mock-режиме.
2. Открыть Error Analyst — в Debugger должна отображаться демонстрационная ошибка `TOOL_TIMEOUT`.
3. Нажать на `Search logs`, изучить Input и Error, переключиться на traceback.
4. Нажать `Retry node`; посмотреть отдельный replay запуск.
5. Выбрать Configure, изменить prompt/название или добавить Tool узел.
6. Соединить новый узел, нажать Save draft и обновить страницу: изменения должны сохраниться в localStorage.
7. Нажать Validate; для графа с Input и Output результат должен быть успешным.
8. Нажать Run workflow, проверить JSON input и Execute workflow. Статусы узлов должны обновляться в debugger, затем запуск появится в Runs & traces.
9. Создать новый workflow, соединить Input и Output, сохранить и запустить.
10. Очистить localStorage-ключи, чтобы вернуть исходный demo workflow и failed trace.

## Текущие ограничения frontend MVP

- Drag-and-drop узлов из библиотеки реализован; продвинутые операции canvas (копирование/вставка, multi-select shortcuts и undo/redo) пока не входят в MVP.
- Нет произвольного Python-кода, циклов на графе, авторизации, подключения пользовательских credentials и real-time совместного редактирования.
- Моковый execution является демонстрацией UI, а не настоящей runtime-семантикой.
- Разделы Settings и несколько инструментальных действий пока являются UI-заготовками.
- API DTO — ожидаемый контракт интеграции; если существующий backend выберет иной контракт, нормализуй его в `src/api/client.ts`.
