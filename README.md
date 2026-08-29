# Альбом — парный дневник воспоминаний (dev)

## Навигация и новые страницы

- В нижнем меню добавлен пункт «Игры» (иконка джойстика). Путь: `/games`.
- Страница игр содержит грид доступных мини-игр с кнопкой «Начать игру» для каждой. Вёрстка помечена `data-testid` для стабильных e2e:
  - `data-testid="games-page"` — контейнер страницы (есть и в состоянии загрузки)
  - `data-testid="games-grid"` — грид карточек игр
  - `data-testid="game-card-<id>"` и `data-testid="button-start-<id>"`

## E2E‑тесты (Playwright)

Локальный прогон (Windows PowerShell):

```pwsh
npm run -s e2e
```

Полезные режимы:

```pwsh
# Запуск одного теста по имени
npm run -s e2e -- -g games-smoke

# UI-режим
npm run -s e2e:ui
```

Замечания по окружению:

- Во время e2e `DATABASE_URL` принудительно пустой, сервер использует in-memory storage.
- Базовый URL для браузера: `PLAYWRIGHT_BASE_URL` (по умолчанию `http://127.0.0.1:5000`).

Общие e2e-утилиты:

- Файл `e2e/utils.ts` предоставляет хелперы, чтобы писать короткие и стабильные тесты:
  - `registerViaApi(request, prefix)` — быстрая регистрация пользователя через API.
  - `loginUI(page, creds)` — логин через UI вкладки «Вход».
  - `createInvite(request)` — создать инвайт-код пары.
  - `registerPartnerWithInvite(browser, code, prefix)` — зарегистрировать партнёра в новом контексте и вернуть `{ ctx, page }`.
  - `openGame(page, gameTestId)` — открыть страницу игр и карточку нужной игры, дождаться кнопки «Назад».
  - `fillByType(locator, value)` — корректно заполнить поля с `type=number` или текстовые.

Стабильные селекторы:

- В списке игр карточки помечены `data-testid="game-card-<id>"`.
- Для игры «20 вопросов» добавлены фазы:
  - `data-testid="phase-setup"`, `phase-thinking`, `phase-guessing`, `phase-finished`.
- Для «Викторины о партнёре» добавлены:
  - `data-testid="phase-setup"`, `phase-answering`, `phase-guessing`.
- Для «Ролевой игры» добавлены:
  - `data-testid="phase-selection"`, `phase-role-assignment`, `phase-playing`.
- Для «Правда или Действие» добавлены:
  - `data-testid="phase-selection"`, `phase-action`.
- Общие элементы:
  - Кнопка возврата из игры: `data-testid="button-back"`.
  - Заголовки и ключевые поля/кнопки имеют `data-testid` там, где это важно для e2e.

Покрытие E2E (выдержка):

- Игры — навигация и открытие всех карточек (`e2e/games-all.spec.ts`).
- Ролевая игра — минимальный флоу выбора сценария, старта, отправки сообщения и новой подсказки (`e2e/role-playing-flow.spec.ts`).
- Двухпользовательские флоу: викторина партнёров и «20 вопросов» используют инвайт и второй браузерный контекст (`e2e/partner-quiz-flow.spec.ts`, `e2e/twenty-questions-flow.spec.ts`).
- Быстрые smokes:
  - «Правда или Действие» — открытие и базовый UI без второго контекста (`e2e/truth-or-dare-smoke.spec.ts`).
  - «Ролевая игра» — выбор сценария и переход к назначению ролей (`e2e/role-playing-smoke.spec.ts`).
  - «Профиль: аватар» — загрузка изображения и появление `<img alt="Avatar">` (`e2e/avatar-upload-smoke.spec.ts`).
  - «Чат: эфемерные» — включение режима, отправка сообщения, проверка таймера/пометки (`e2e/chat-ephemeral-smoke.spec.ts`).
- «Музыка: хоткеи» — проверка Space/стрелок/мьюта/prev/next (`e2e/music-hotkeys-smoke.spec.ts`).
- «Музыка: мини‑плеер» — появление и базовые элементы (`e2e/music-mini-player.spec.ts`).
- «Музыка: загрузка» — диалог метаданных, появление в списке, очистка удалением (`e2e/music-upload-smoke.spec.ts`).
- «Музыка: удаление» — удаление строки через меню (`e2e/music-delete-smoke.spec.ts`).
- «Музыка: редактирование» — изменение названия/исполнителя (`e2e/music-edit-meta-smoke.spec.ts`).

A11y‑smoke:

- Публичные страницы `/auth`, `/privacy`, `/terms` проверяются с помощью `@axe-core/playwright` (`e2e/a11y-smoke.spec.ts`).
- Авторизованные страницы «Музыка / Профиль / Настройки» имеют отдельный строгий a11y‑smoke (`e2e/a11y-auth-smoke.spec.ts`) — тесты падают при любой серьёзной/критичной проблеме.
  - Запуск только a11y‑смоков: `npm run -s e2e -- -g "^a11y:"`

### Пример мультиконтекстных тестов (инвайт + второй контекст)

Когда сценарий требует двух пользователей (вы и партнёр), используйте хелперы из `e2e/utils.ts`:

```ts
import {
  registerViaApi,
  loginUI,
  createInvite,
  registerPartnerWithInvite,
  openGame,
} from './utils';

test('partner flow example', async ({ page, request, browser }) => {
  // 1) Регистрируемся через API, логинимся через UI
  const creds = await registerViaApi(request, 'demo');
  await loginUI(page, creds);

  // 2) Создаём инвайт и регистрируем партнёра во втором контексте
  const inviteCode = await createInvite(page.request);
  const { ctx, page: partnerPage } = await registerPartnerWithInvite(browser, inviteCode, 'demo');

  // 3) Открываем нужную игру у обоих (например, викторина)
  await openGame(page, 'game-card-partner-quiz');
  await openGame(partnerPage, 'game-card-partner-quiz');

  // 4) Пишем ассерты и действия…
  // ...

  await ctx.close();
});
```

Советы:

- Избегайте жёстких ожиданий и заголовков, предпочитайте устойчивые `data-testid`.
- Для числовых полей используйте `fillByType` — он корректно заполнит `<input type="number">`.

## Быстрая проверка

```pwsh
npm run -s check      # TypeScript (в Windows использует локальный tsc через node)
npm run -s test       # Юнит-тесты (Vitest)
npm run -s e2e        # E2E (Playwright)
```

## Бейджи и статус

<!-- Badges: замените <owner>/<repo> после пуша в GitHub -->
<p align="left">
  <a href="https://github.com/<owner>/<repo>/actions/workflows/ci.yml">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/<owner>/<repo>/ci.yml?label=CI&logo=github" />
  </a>
  <a href="https://github.com/<owner>/<repo>/actions/workflows/deploy.yml">
    <img alt="Deploy" src="https://img.shields.io/github/actions/workflow/status/<owner>/<repo>/deploy.yml?label=deploy&logo=render" />
  </a>
  <a href="https://img.shields.io/docker/image-size/ghcr.io/<owner>/<repo>/latest">
    <img alt="Docker image size" src="https://img.shields.io/docker/image-size/ghcr.io/<owner>/<repo>/latest" />
  </a>
  <a href="#тесты"><img alt="tests" src="https://img.shields.io/badge/tests-vitest-6E9F18" /></a>
  <a href="#pre-commit-хуки"><img alt="pre-commit" src="https://img.shields.io/badge/pre--commit-husky-blue" /></a>
</p>

Кратко: минималистичное веб‑приложение для пары. Можно хранить воспоминания (фото/видео/текст/цитаты), переписываться в чате (в т.ч. эфемерные сообщения), играть в мини‑игры, считать важные вещи (счётчики), слушать свою музыку, вести профиль и настраивать совместные параметры.

## Концепция и общее устройство

- Клиент: React + Vite + Tailwind (минималистичный UI, единая палитра, стеклянные панели). Роутинг — Wouter. Состояние данных — TanStack Query.
- Сервер: Node.js + Express + Vite (в dev), WebSocket (ws) для real‑time чата и игр, сессии через express‑session.
- Данные: Drizzle ORM (PostgreSQL). В dev без БД доступно временное in‑memory хранилище. Схемы и валидация запросов — Zod.
- Файлы: локальные загрузки в `public/uploads/*` (аватары, воспоминания, аудио). В проде можно переключить на облако.

Основные разделы:

- Лента воспоминаний: просмотр/создание, теги, видимость, превью.
- Чат: обычные и эфемерные сообщения (исчезают через 2 минуты, срок контролирует сервер — `EPHEMERAL_MESSAGE_TTL_MINUTES`), индикация печати, реакции, отметки «прочитано», анимации слов.
- Игры: викторина о партнёре, правда или действие, 20 вопросов и ролевая игра — с real‑time синхронизацией по WebSocket.
- Счётчики: небольшие виджеты для совместных целей.
- Профиль/настройки: персональные и парные параметры, тема, фон чата и др.

## Архитектура

- `client/` — фронтенд (React + Tailwind). Важное:
  - `src/pages/*` — страницы.
  - `src/components/*` — UI и виджеты (карточки, модалки, чат‑сообщения и пр.).
  - `src/lib/*` — утилиты, клиент API, настройки Query Client.
  - `src/hooks/*` — аутентификация, плеер, тосты.
- `server/` — бэкенд (Express + ws):
  - `index.ts` — инициализация сервера, Vite middlewares в dev, статика в prod.
  - `routes.ts` — REST API и WebSocket `/ws`.
  - `auth.ts` — локальная аутентификация, сессии.
  - `storage.ts` — реализация хранилища: `MemStorage` (dev) и `PgStorage` (prod/БД).
  - `db.ts` — подключение к Postgres (Neon/pg) и Drizzle.
  - `vite.ts` — интеграция Vite с Express в dev.
- `shared/schema.ts` — единые типы и схема БД (Drizzle + Zod).

## Переменные окружения

Скопируйте `.env.example` в `.env` и при необходимости заполните:

- `DATABASE_URL` — строка подключения Postgres (для prod и dev с БД).
- `SESSION_SECRET` — секрет для сессий.
- `APP_ORIGIN` — базовый URL (например, `http://127.0.0.1:5000`).
- `PORT` — порт сервера (по умолчанию 5000; в dev авто‑подбор следующего свободного).

Секреты `.env` игнорируются Git.

## Скрипты и задачи

- Разработка:
  - `npm run dev` — dev‑сервер (Express + Vite HMR).
  - `npm run dev:debug` — то же, но с Node инспектором.
- Проверки/сборка:
  - `npm run check` — проверка типов TypeScript.
  - `npm run build` — сборка клиента и бандл сервера.
  - `npm start` — запуск собранного сервера.
  - `npm run lint` / `npm run lint:fix` — ESLint проверки/исправления.
  - `npm run format` — форматирование Prettier.
- База (Drizzle):
  - `npm run db:push` — применить схему к БД (нужны корректные права на Postgres).

В VS Code доступны задачи (`.vscode/tasks.json`): Dev, Build, TypeScript check, DB push, Env check и др.

## Принципы и стиль

- Минимализм: единая палитра, аккуратные отступы, стеклянные панели без лишней визуальной «шумихи».
- Безопасность: валидации Zod на сервере, контроль сроков эфемерных сообщений на сервере, маскирование чувствительных логов.
  - Заголовки безопасности через helmet (CSP отключён в dev для совместимости с Vite, COEP отключён для HMR).
  - Rate limiting: общий лимит для `/api/*`, отдельные строгие лимиты для `/api/login`, `/api/register*` и эндпоинтов загрузки.
- Производительность: real‑time через WebSocket, без агрессивного polling; чёткий split клиента возможен позже.

## UI-утилиты: стекло и доступность

- Стеклянные панели:
  - Класс `glass` — базовое стекло с мягкими тенями.
  - Класс `glass-strong` — более контрастное стекло для акцентов.
- Ховеры и фокус:
  - `hover-lift` — лёгкий подъём/тень при наведении.
  - `focus-ring` — заметное и доступное фокус‑кольцо.
- Фоновые слои:
  - `.ui-noise` и `.ui-glow` — фоновые шум и мягкое свечение, добавляются глобально в `App.tsx`.
- Reduced motion:
  - Уважение системной настройки `prefers-reduced-motion`: анимации упрощаются/отключаются.

Где смотреть:

- Реализация классов — `client/src/index.css`.
- Пример подключения фоновых слоёв — `client/src/App.tsx`.
- Примеры применения — `BottomNav`, `memory-card`, `home-page`.

## Горячие клавиши аудиоплеера

- Пробел — Play/Pause
- ← / → — Перемотка −5/+5 секунд
- ↑ / ↓ — Громкость ±5%
- M — Mute/Unmute
- N / P — Следующий / Предыдущий трек

## Паттерн обработчиков WebSocket в играх

Чтобы избежать ошибок порядка объявлений (used before declaration) и лишних перерендеров:

- Объявляйте вспомогательные функции/колбэки, которые нужны в `useEffect`, до самого эффекта.
- Либо обрабатывайте сообщения прямо внутри `ws.onmessage` и не тяните внутрь эффекта внешние обработчики.
- Для чтения актуального состояния внутри колбэков используйте `useRef` снапшоты (например, `roundRef` для результата раунда).

Примеры: `partner-quiz.tsx` (инлайн обработка), `role-playing.tsx` (колбэки объявлены перед эффектом), `twenty-questions.tsx`.

## Статус проверок

- TypeScript: зелёный (`npm run check`).
- ESLint: строгий режим поддерживается (`npm run lint:strict`).
- Verify: единый прогон `npm run verify` (tsc + eslint strict + tests + smoke).

## Тесты

- Фреймворк: Vitest. Конфиг — `vitest.config.ts` (alias `@`, `@shared`).
- Тесты лежат в `tests/`. Сейчас покрыт `MemStorage` базовыми кейсами.
- Запуск:
  - `npm run -s test` — единоразовый прогон
  - `npm run -s test:watch` — режим наблюдения
- Примечание: во время юнит‑тестов `.env` не загружается (см. `server/config.ts`), `DATABASE_URL` очищается через `tests/setup.ts`, сервер использует in-memory хранилище. Для проверки против реальной БД явно задайте `DATABASE_URL` и запустите вне `NODE_ENV=test`.

## E2E‑тесты (Playwright)

- Установка браузеров (однократно): `npm exec -- @playwright/test install`
- Запуск смоук‑тестов:
  - `npm run -s e2e`
  - UI‑режим: `npm run -s e2e:ui`
- База URL для e2e: задайте `PLAYWRIGHT_BASE_URL` (по умолчанию `http://127.0.0.1:5000`).
  - PowerShell: `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5000'; npm run -s e2e`

Примечание для Windows/Pwsh:

- Если PowerShell сообщает «Could not determine Node.js install directory», запустите Playwright через локальный CLI ноды:

```pwsh
npm run -s e2e:node -- -g "settings: reset to defaults"
```

## Pre-commit хуки

Включены husky + lint-staged:

- На коммит выполняются: форматирование Prettier и eslint --fix только по затронутым файлам, затем общий tsc, eslint:strict и vitest (только изменённые тесты, при необходимости — полный прогон).
- Настройки: раздел `lint-staged` в `package.json`, хук `.husky/pre-commit`.

Примечание: если коммит слишком большой, прогон может занять время — рекомендуется коммитить чаще небольшими порциями.

### CI/CD

- **CI** (`.github/workflows/ci.yml`): запускается на push/PR в `main`/`master`. Выполняет typecheck, lint (ошибки), unit-тесты, smoke (in-memory), сборку клиента/сервера и сборку Docker-образа (с кэшем buildx).
- **E2E** (`.github/workflows/e2e.yml`): Playwright E2E-тесты + a11y-smoke на push/PR в `main`, с артефактами отчётов.
- **Deploy** (`.github/workflows/deploy.yml`): при пуше в `main`/`master` после успешного CI триггерит деплой на Render через Deploy Hook (`RENDER_DEPLOY_HOOK` secret). Job пропускается, если secret не задан.
- **Render**: `render.yaml` описывает web-сервис (Docker runtime). Dockerfile собирает приложение, health-check на `/api/health`.
- БД: в non‑prod окружении при отсутствии `DATABASE_URL` сервер работает в in‑memory режиме, что позволяет выполнять smoke без внешней базы.

## Деплой

### Настройка Render (рекомендуется)

1. Создайте **PostgreSQL** в [Render](https://render.com) (или используйте внешний).
2. Добавьте **Web Service** из репозитория (GitHub). Render автоматически использует `render.yaml` и `Dockerfile`.
3. Установите переменные окружения:
   - `DATABASE_URL` — internal connection URL от Render Postgres.
   - `SESSION_SECRET` — генерируется автоматически (можно перезаписать своим).
   - `APP_ORIGIN` — публичный URL приложения, например `https://album.onrender.com`.
   - Опционально: `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` — базовая аутентификация.
4. Диск `uploads` монтируется в `/app/public/uploads` (1 ГБ, бесплатный план).

### Настройка деплоя через GitHub Actions (опционально)

Если хотите держать деплой под контролем CI:

1. В Render: **Dashboard → ваш сервис → Settings → Deploy Hook**, скопируйте URL.
2. В GitHub: **Repo → Settings → Secrets and variables → Actions**, добавьте secret `RENDER_DEPLOY_HOOK` со значением URL.
3. При пуше в `main`/`master` сначала пройдёт CI, затем workflow `deploy.yml` вызовет Deploy Hook.

> Если Deploy Hook не нужен, удалите `.github/workflows/deploy.yml` — Render сам деплоит по push при `autoDeploy: true`.

### Локальная Docker-сборка

```bash
docker build -t endlessalbum .
docker run --rm -it \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e SESSION_SECRET=change_me \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -p 5000:5000 \
  endlessalbum
```

### Переменные окружения (полный список)

| Переменная | Обязательна | Описание |
|-----------|-------------|----------|
| `NODE_ENV` | да | `production` в проде |
| `PORT` | нет | Порт сервера (по умолчанию 5000) |
| `SESSION_SECRET` | да | Секрет сессий |
| `DATABASE_URL` | да (prod) | Строка подключения PostgreSQL |
| `APP_ORIGIN` | нет | Публичный origin (cookies/callbacks) |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | нет | Базовая аутентификация |
| `BASIC_AUTH_REALM` | нет | Realm для Basic Auth (default: "Private") |
| `GCS_BUCKET` / `GCS_KEYFILE` | нет | Google Cloud Storage (если настроен) |
| `RATE_LIMIT_DISABLED` | нет | `1` — отключить rate limiting |

## Безопасность (включено из коробки)

- Helmet: добавляет базовые security‑заголовки. В dev отключены `contentSecurityPolicy` и `crossOriginEmbedderPolicy` для корректной работы Vite HMR.
- Rate limiting: мягкий лимит для всех `/api/*` (по умолчанию 300 запросов/мин), плюс более строгие лимиты для авторизации и загрузок.
- Эфемерные сообщения: срок действия задаётся только на сервере, клиентская длительность игнорируется.

## Сервисные эндпоинты (здоровье/версия)

- `GET /api/health` — простой статус `{ status: "ok", env }` (без аутентификации)
- `GET /api/version` — читает `package.json` и отдаёт `{ name, version }`

## Быстрый smoke-тест хранилища

Для базовой валидации памяти MemStorage добавлен скрипт:

- Запуск: `npm run smoke`
- Проверяет:
  - создание пользователя и авто-создание пары для main_admin
  - генерацию/отзыв/повторную генерацию инвайт-кода
  - присоединение к паре и корректное присвоение роли (guest|co_admin)
  - получение партнёра `getPartnerInfo`
  - обновление пользователя `updateUser` с сохранением `id`/`updatedAt`

### VS Code Tasks

В `.vscode/tasks.json` доступны задачи:

- TypeScript check — проверка типов
- ESLint (strict) — строгий линт без предупреждений
- Smoke (MemStorage) — быстрый прогон in-memory сценариев
- Verify (tsc+lint+smoke) — полный прогон проверок

## Быстрый старт

1. Установить зависимости: `npm i`
2. Заполнить `.env` (или удалить `DATABASE_URL`, чтобы в dev использовать in‑memory).
3. Запустить разработку: `npm run dev`
4. Открыть URL из лога (ожидаемо `http://127.0.0.1:5000` или `:5000`).

## Заметки о dev/БД

- Если задать `DATABASE_URL`, сервер и сессии используют Postgres. Убедитесь, что учетные данные верные — иначе миграции/CRUD упадут.
- Для локальной разработки допустим режим без БД: просто не задавайте `DATABASE_URL`.

---

Поддержка и доработка: добавление хуков pre‑commit (Husky), Docker‑сборка, облачные стореджи (S3/GCS) и CI/CD — по запросу