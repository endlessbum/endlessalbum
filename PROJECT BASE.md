Цель: веб‑приложение для пар «Endlessalbum» (UI на русском) — общий аккаунт на двоих, где один пользователь (main_admin) создаёт пару и генерирует инвайт‑код, а второй (co_admin) присоединяется по нему. Приложение предоставляет общий альбом воспоминаний, реальный чат с серверно‑контролируемыми эфемерными сообщениями, синхронизированные по WebSocket мини‑игры, счётчики, музыку и настройки пары. Код — единый Node‑процесс (API + клиент); «план» ниже отражает ФАКТИЧЕСКУЮ реализацию репозитория, а не устаревший черновик в файле «Вся база проекта.txt».

1. Архитектура и технологии

Стек:
- Frontend: React 18 + Vite + TypeScript, маршрутизация — Wouter, серверное состояние — TanStack Query (staleTime: Infinity, без refetch-on-focus, без retry), стили — Tailwind + shadcn/ui (Radix), анимации — framer-motion/tw-animate-css, иконки — lucide-react, формы — react-hook-form + zod.
- Backend: Express 4 (TypeScript), валидация — Zod, пагинация/схемы — drizzle-zod, сессии — express-session + passport (local), хеширование паролей — scrypt (node:crypto).
- БД: PostgreSQL через Drizzle ORM; схемы описаны в shared/schema.ts и являются ЕДИНЫМ источником правды (Drizzle → drizzle-zod → типы → серверные zod‑схемы).
- Сессии: MemStorage-хранилище (memorystore) в dev/test, connect-pg-simple (таблица session) в prod.
- Загрузка медиа: multer (memory/disk), файлы локально в public/uploads/*, опционально облако Google Cloud Storage (GCS_BUCKET + GCS_KEYFILE).
- Реальное время: собственный WebSocket-сервер (ws) на пути /ws того же HTTP-сервера.
- Развёртывание: Render (render.yaml, healthcheck /api/health); в dev — Vite как Express-мидлварь (server/vite.ts) с автоподбором свободного порта, в prod — статически собранный клиент из dist.

Ключевые модули сервера (каждый первым импортирует ./config — fail-fast проверки безопасности):
- server/index.ts — сборка Express-приложения: helmet, rate limiting (API 300/мин, auth 20/мин, upload 60/мин), requestId, логирование запросов, CSRF, graceful shutdown (SIGTERM/SIGINT, закрытие WS → сессий → пула БД за 30с).
- server/auth.ts — passport local, регистрация/вход/выход, /api/csrf-token, создание пары при регистрации.
- server/routes.ts — все REST‑роуты + весь WebSocket-сервер (verifyClient, heartbeat, эфемерная очистка).
- server/storage.ts — интерфейс IStorage + две реализации MemStorage/PgStorage + синглтон `storage`.
- server/csrf.ts — signed double-submit токен вне сессии.
- server/multer-config.ts — per-type multer-хендлеры и фильтры MIME.
- server/db.ts — pg pool + Drizzle, TLS secure-by-default (DATABASE_CA_CERT).
- server/gcs.ts, server/client-ip.ts, server/logger.ts, server/vite.ts — облако, IP за прокси, логирование, Vite/статик.

2. Ключевые сущности БД (shared/schema.ts)

- users (id uuid, username unique, email unique, password, first_name, last_name, profile_image_url, role: main_admin|co_admin|guest, couple_id, is_online, last_seen, status, wishlist jsonb []. createdAt/updatedAt)
- couples (id, main_admin_id, co_admin_id, invite_code unique, settings jsonb {}, created_at) — максимум 2 участника
- memories (id, couple_id, author_id, title, content, type: photo|video|text|quote, media_url, thumbnail_url, visibility jsonb {}, tags text[], created_at, updated_at)
- comments (id, memory_id, author_id, content, created_at)
- messages (id, couple_id, sender_id, content, type: text|image|video|voice|ephemeral_image|ephemeral_video|document, media_url, is_ephemeral, expires_at, is_read, reactions jsonb {} — эмодзи → [userId], created_at)
- games (id, couple_id, type: truth_or_dare|twenty_questions|partner_quiz|role_playing, state jsonb {}, current_player, is_active, created_at, updated_at)
- counters (id, couple_id, name, value, target_date, is_visible, created_at)

Серверные zod‑схемы (важнейшие): serverMemorySchema, serverMessageSchema, wsChatMessageSchema, wsGameActionSchema, serverCounterSchema, updateProfileSchema, coupleSettingsSchema, registerSchema/inviteRegisterSchema. senderId/coupleId/expiresAt всегда проставляет сервер из сессии — клиентский ввод не доверяется.

3. REST API (все под /api, мутации под CSRF)

Аутентификация:
- GET /api/health, GET /api/version, GET /api/csrf-token
- POST /api/register (создаёт юзера + пару, main_admin), POST /api/register-with-invite (= /api/invite/register)
- POST /api/login (passport local), POST /api/logout, GET /api/user

Воспоминания:
- GET /api/memories, POST /api/memories, PUT /api/memories/:id, DELETE /api/memories/:id (при удалении/обновлении чистит локальные файлы: media, thumbnail, image_url:*)
- GET/POST /api/memories/:memoryId/comments

Чат:
- GET /api/messages (пагинация: limit ≤200, offset, before; лениво чистит просроченные эфемерные), POST /api/messages, PUT /api/messages/:id (status-обновление read/reactions — обоим; контент — только автору), DELETE /api/messages/:id (только автор)

Пара/партнёр:
- GET /api/partner, GET /api/couple (без invite_code)
- GET /api/couple/invite-code, POST /api/couple/invite, POST /api/couple/revoke-invite (все — только main_admin)
- POST /api/couple/join (присоединение по коду; ошибки: invalid/full/already)

Настройки и профиль:
- GET/PUT /api/settings (userSettings: firstName/lastName/profileImageUrl; coupleSettings — только main/co_admin, merge jsonb)
- GET/PUT /api/profile (+ уникальность username/email, wishlist, status)
- GET /api/profile + stats (memoriesCount, messagesCount, gamesCount, daysInCouple, placesVisited по тегам location:*)

Загрузки (multer + лимиты из shared/constants.ts):
- POST /api/upload/avatar (5 МБ, память), /api/upload/memory-image (20 МБ, память), /api/upload/memory-video (100 МБ, диск), /api/upload/document (25 МБ), /api/upload/audio (50 МБ), /api/upload/voice (10 МБ), /api/upload/audio-cover (20 МБ). Каждый отдаёт { url }; GCS — приоритетно.

Музыка:
- GET /api/audios, GET /api/partner/audios (список файлов из uploads/audios/<userId>), DELETE /api/audios?url=&cover= (только свои, защита от path traversal)

Счётчики и игры:
- GET/POST /api/counters, PUT/DELETE /api/counters/:id
- GET/POST /api/games (для active-партии того же типа переиспользует существующую; guest-доступ через privacy)

4. WebSocket (/ws)

Авторизация в verifyClient: проверка Origin против Host (localhost-варианты), rate limit на IP (5 соединений, TRUSTED_PROXY_HOPS=1), разбор connect.sid cookie → sessionStore → passport.user. Heartbeat ping/pong каждые 30с с terminate мёртвых сокетов. Ограничение размера сообщения 64 КБ.

Входящие (клиент → сервер, дискриминатор type):
- chat_message (zod-валидация, senderId проставляет сервер, эфемерные TTL 2 мин)
- game_action (wsGameActionSchema; senderId сверяется с сессией; action game_completed/round_finished → сохраняет state.lastResult и гасит is_active)
- game_invitation (рассылка приглашения партнёру)
- typing_start / typing_stop (релей партнёру)
- presence_ping (обновляет lastSeen, отвечает presence_ack с онлайн-статусом партнёра)

Исходящие (сервер → клиент):
- chat_message, chat_message_update (read/reactions), typing_start/stop, partner_status_change (on/offline), game_action, game_invitation, invitation_sent, presence_ack, error

Клиент: единое WS-подключение на вкладку (client/src/lib/ws.ts) с авто-реконнектом через 2с и подпиской через subscribeWs (никаких лишних сокетов на ре-рендер).

5. Страницы и компоненты

5.1. Страница авторизации (/auth) — client/src/pages/auth-page.tsx
- Левая часть: логотип (logo.png) + манифест, правая: карточка с вкладками «Вход / Регистрация / Приглашение».
- Вход: логин/пароль + глаз показа/скрытия.
- Регистрация: email, никнейм, пароль, подтверждение, чекбокс согласия с Политикой.
- Приглашение: подрежимы «У меня есть аккаунт» (логин+пароль+код) и «Нет аккаунта» (полная регистрация + код, формат XXXX-XXXX-XXXX).
- Переключатель языка Ru/En (localStorage ui:lang), футер со ссылками /privacy и /terms. Все ключевые элементы имеют data-testid.

5.2. Главная страница (/) — home-page.tsx
- Заголовок «Наша история» + кнопка «Создать», поиск (хэштеги #, авторы @, ключевые слова и даты), счётчики (до 3 карточек).
- Masonry-сетка воспоминаний, сгруппированная по месяцам («январь 2026»), карточки-«перевортыши» (MemoryCard: front/back, соотношения 9:16…2:3, теги card_ratio/card_orient/card_layout/card_pos_*).
- Модалки: MemoryModal (просмотр, комментарии, аудио-плеер, удаление) и CreateMemoryModal (создание/редактирование, типы text/photo/video/quote, привязка музыки, фокус изображения, drag-доп.фото).

5.3. Чат (/messages) — chat-page.tsx
- Шапка: аватар партнёра + онлайн-пульсация/«Печатает...», кнопка «Настройки чата» (→ /settings?tab=messages).
- Лента: ChatMessage (свои/чужие), реакции-эмодзи, прочтения, редактирование/удаление, таймер эфемерных сообщений, word-animations («люблю», «целую», …) по настройкам ui:wordAnimations.
- Ввод: текстареа (Enter = отправка), режим эфемерных текстов (таймер 2 мин), скрепка (изображение/видео/документ/эфемерное фото/видео), эфемерная камера (EphemeralCapture, видео до 10с), голосовые (MediaRecorder, выбор mimeType), фон чата (chatBackgrounds.ts: none/blue/green/peach/pink/lightGray/dark).

5.4. Игры (/games) — games-page.tsx
- Сетка карточек: «Правда или действие», «20 вопросов», «Ролевая игра», «Викторина о партнёре» (data-testid game-card-<type с дефисами>), кнопка «Начать» + InvitePartnerButton (приглашение через WS).
- GameInvitationNotification — приём приглашения от партнёра.
- Игровые компоненты (client/src/components/games/*): truth-or-dare, twenty-questions, partner-quiz, role-playing. Каждая: фазы (setup/thinking/guessing/finished и т.п.), синхронизация через sendWs/subscribeWs (паттерн: обработчики объявляются до useEffect, live-состояние через useRef), WS-сообщения описаны в shared/schema.ts (PartnerQuiz*, RolePlaying*, TruthOrDare*, TwentyQuestions*).
- Кастомные вопросы/действия берутся из настроек пары (truthQuestions, dareActions, guessQuestions).

5.5. Музыка (/music) — music-page.tsx (~1400 строк)
- Две вкладки/режима: своя музыка и музыка партнёра (GET /api/audios, /api/partner/audios).
- Загрузка треков (XHR + attachCsrfHeader + прогресс), обложки (upload/audio-cover), редактирование метаданных (title/artist/cover) с сохранением в localStorage (music_meta_v1*), удаление, хоткеи.
- Плеер: глобальный AudioPlayerProvider (use-audio-player.tsx) — очередь, repeat none/one/all, shuffle, mute, громкость, сохранение позиции/продолжительности/очереди в localStorage (audio_*_v1), Web Audio fade (200мс), MiniPlayer в сайдбаре, MarqueeText для длинных названий.

5.6. Профиль (/profile) — profile-page.tsx
- Форма (react-hook-form + zod): никнейм, email, имя, фамилия, статус, wishlist (добавление/удаление сразу сохраняется).
- Аватар (avatar-upload.tsx, тип button внутри формы), статистика: дней вместе (из relationshipStartDate — settings или localStorage), воспоминания, места, сообщения. Кнопка выхода.

5.7. Настройки (/settings) — settings-page.tsx (~1500 строк)
- Вкладки: Доступ, Оформление, Сообщения, Уведомления, События, Игры (activeTab синхронизируется с URL, например ?tab=messages).
  - Доступ: инвайт-код (генерация/копирование/отзыв — только main_admin), приватность гостей (memories/comments).
  - Оформление: тёмная тема (ThemeProvider + localStorage app-theme), анимации, язык, шрифты (PitagonSansMono, applyUiFont → --font-sans).
  - Сообщения: фон чата, размер текста, стоп-слово, word-animations (управление списком слов+анимаций), смена chat-пароля (локально).
  - Уведомления: email/push/sound/event-reminders (флаги-предпочтения, доставка пока не реализована).
  - События: счётчики (CRUD, targetDate из <input type=date>), дата начала отношений, интеграция с календарём.
  - Игры: правда/действия/вопросы текстовыми списками, звуки в играх.
- Кнопки Сбросить (ui:defaultsSettings) и Сохранить.

5.8. Прочее
- App.tsx: QueryClientProvider → ThemeProvider → AuthProvider → TooltipProvider → AudioPlayerProvider; AppShell (сайдбар на десктопе ≥lg, верхний хедер + компактная навигация на мобиле, MobileDrawer — Sheet); Lazy-загрузка страниц; ProtectedRoute (редирект на /auth); ErrorBoundary; GlobalErrorToasts.
- Sidenav: Главная, Музыка, Игры, Сообщения, Профиль, Настройки (lucide-иконки).
- Публичные страницы: /privacy, /terms, 404.

6. Функциональные механики

6.1. Эфемерные сообщения (сервер-authoritative)
- TTL задан константой EPHEMERAL_MESSAGE_TTL_MINUTES = 2 (не «5 минут» из прозы). expiresAt всегда пересчитывает сервер; при редактировании эфемерное остаётся эфемерным.
- Очистка: фоновая задача каждые 60с (EPHEMERAL_CLEANUP_INTERVAL_MS) + лениво из GET /api/messages; удаляются и сами строки, и связанные файлы из public/uploads (unlinkUploadIfLocal с защитой resolveUploadPath от path traversal).

6.2. Права и роли
- main_admin: генерация/отзыв инвайт-кодов, настройки пары. co_admin: настройки пары. guest: доступ к memories/comments/games только по per-couple settings.privacy (checkGuestAccess в routes.ts). В паре максимум 2 человека (main_admin + co_admin).

6.3. Инвайт-коды
- Формат XXX-XXXX-XXXX (randomBytes, base36, uppercase); уникальность на уровне couple.invite_code; смена = перезапись, отзыв = null (срок действия 1 день из старого плана НЕ реализован).

7. Безопасность

- Пароли: scrypt с солью (16 байт) + timingSafeEqual.
- Сессии: express-session, httpOnly + sameSite:strict + secure в prod, maxAge 24ч; SESSION_SECRET обязателен в prod.
- CSRF: подписанный double-submit токен вне сессии (cookie + X-CSRF-Token + Origin/Referer), отключён только при NODE_ENV=test. Клиент всегда ходит через apiRequest/csrfFetch/csrfUploadFetch/attachCsrfHeader.
- Rate limiting: 300/мин API, 20/мин auth, 60/мин upload, 5 WS-соединений на IP (с проверкой IP за доверенным прокси).
- Загрузки: валидация MIME и размера, изоляция путей, очистка старых файлов, защита от сирот.
- Production fail-fast (config.ts): неизвестный NODE_ENV, отсутствие SESSION_SECRET/DATABASE_URL, RATE_LIMIT_DISABLED=1, отключённый DB TLS — блокируют старт.
- Helmet CSP в prod; ошибки наружу только обобщённые + requestId; пароль не отдаётся (sanitizeUser).
- Валидация всего входящего (тела REST и WS) через Zod; идентичность отправителя — только по сессии.

8. Тестирование и качество

- Юниты (Vitest, tests/): схемы (counter, game, message, profile, ws-chat-message), CSRF, client-ip, config-safety, file-size-limits, MemStorage-контракты, клиентские утилиты (query-client, protected-route, shared-utils, utils).
- Smoke-скрипт: scripts/smoke.ts (MemStorage, без БД).
- E2E (Playwright, e2e/): auth, home, chat (включая эфемерные медиа/видео), игры (games-smoke, truth-or-dare, twenty-questions, partner-quiz, role-playing), музыка (upload/edit/delete/mini-player/hotkeys), профиль, настройки, мобильный layout, a11y (axe). playwright.config.ts сам поднимает сервер (NODE_ENV=test, DATABASE_URL='', RATE_LIMIT_DISABLED=1) — E2E всегда на MemStorage.
- Конвенции testid: гифены в карточках игр, message-<id> только для пузырей, стабильные селекторы в e2e/utils.ts.
- Команды: npm run check / lint / lint:strict / test / smoke / verify (полный гейт), build, start, db:push. Pre-commit: Prettier + eslint --fix + tsc + strict lint + vitest.

9. Деплой и окружение

- Render: render.yaml, healthcheck GET /api/health; переменные окружения (DATABASE_URL, SESSION_SECRET, опционально GCS_*, BASIC_AUTH_USER/PASS, DATABASE_CA_CERT, LOG_LEVEL, PORT).
- db:push — drizzle-kit push для применения схемы к Postgres.
- В dev без DATABASE_URL используется MemStorage; prod без DATABASE_URL не стартует.
