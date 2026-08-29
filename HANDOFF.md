# Handoff: Endlessalbum redesign (промт для нового чата)

Продолжение работы над полным редизайном Endlessalbum в `/workspace`. Сначала прочитай `PROJECT BASE.txt` (если есть), затем `CLAUDE.md`, затем этот документ (полное описание сделанного, контракты и команды), затем `REDESIGN.md`.

Статус коротко: тёмная премиальная тема, левый sidebar + mobile drawer вместо нижнего бара, переписаны все страницы (App/home/chat/music/games/profile/settings), мини-плеер в sidebar — реализовано. Выполнен полный **монохромный pass** дизайн-системы по `REDESIGN.md` (палитра строго `#000`/`#FFF`/`#B6B6B6`, без градиентов и alpha-оттенков): переписаны токены, `ui/*`, игры, страницы, `chatBackgrounds`; починены контрасты. Редизайн закоммичен (`4f4bb42 Initial commit`). Затем — **layout/contrast pass** (см. «Что сделано»): устранены перекрытия (sidebar после авторизации, шапка /music) и нечитаемые тексты на монохромном фоне (вкладки auth/settings, статусы игр, статистика профиля, музыкальные бейджи, эфемерные оверлеи чата, 404) — всё строго в монохромной палитре. `npm run check`, `npm run lint:strict`, `npm test` (112), `npm run smoke` — зелёные.

E2E: первый полный прогон был 14 failed / 37 passed; внесены фиксы (testid `game-card-*` с дефисами, `chat-input-container`, префиксы вложенных контролов, профиль без reset после save, настройки сразу пишут в localStorage, аватар `type="button"`, a11y `overflow-x: clip` + aria-label паролей). Финальный полный прогон — **зелёный: 48 passed / 3 skipped / 0 failed** (3 skipped — только runtime-спеки: эфемерное видео в headless Chrome, music delete/edit при пустом списке треков). Последние падения (профиль-ремаунт, `twenty-questions-flow`) исправлены в этой сессии — см. «Что осталось» → закрытые пункты.

## Что сделано (не переделывать)

### Монохромная дизайн-система по REDESIGN.md (последняя сессия)

Тёмная монохромная палитра — единственная тема. Строго три цвета: `#000000` (фон/поверхности), `#FFFFFF` (текст/акценты), `#B6B6B6` (вторичное/границы). Никаких других цветов, градиентов, glow и прозрачности, создающей новый оттенок.

1. **Дизайн-токены** (`client/src/index.css`): `:root`/`.light` переписаны на монохром (`--background:#000`, `--foreground:#FFF`, `--primary:#FFF`, `--primary-foreground:#000`, `--secondary/--muted/--accent…:#B6B6B6` где уместно, `--accent:#FFF`, `--border:#B6B6B6`, `--surface-hover:#B6B6B6`, `--sidebar-active:#FFF` и т.д.; все `--shadow-*` = transparent). Палитра задана в `:root` безусловно — отдельный `.dark`-блок не нужен. Хелперы переопределены на сплошные: `.glass`/`.glass-strong` = `--surface` + `--border-subtle` (без blur), `.pulse-online` = opacity-пульс, `.blush-bubble::after` = кольцо `--accent-strong`, `.ephemeral-timer` = `--surface-hover` + `--primary-foreground`, `.btn-gradient` = `--accent-strong` + hover `--accent-hover`, `.modal-backdrop` = `--background`. Убран `backdrop-filter` с оверлеев и `.hover-lift:hover` translateY.
2. **`tailwind.config.ts`**: keyframes `pulse-green` boxShadow → `#B6B6B6`.
3. **`theme-provider.tsx`**: `defaultTheme="dark"`; классы `light`/`dark` на `<html>` продолжают переключаться (так хочет `settings-appearance.spec.ts`, читающий classList), но палитра не меняется — dark-only визуально.
4. **`ui/*`**: убраны alpha-hover'ы и цветные варианты. `button.tsx` (hover→`bg-accent-hover`, disabled→сплошной `bg-surface-hover text-primary-foreground`), `badge.tsx`, `alert.tsx` (`border-destructive/50`→`border-destructive`), `toast.tsx` (default/warning/destructive → монохром; убраны yellow/red/orange и `shadow-lg`), оверлеи `dialog/sheet/drawer/alert-dialog` → `bg-background`, `table.tsx`/`calendar.tsx`/`chart.tsx` `/50`→сплошные, `navigation-menu.tsx` open-state, `ui/chat-message.tsx`, `ui/avatar-upload.tsx` (градиент → `bg-accent-strong`).
5. **Игры** (`components/games/*`): все цветные бейджи категорий/сложности и статусы (green/red/blue/yellow/purple/pink/orange) → монохромные (`bg-surface-soft text-text-primary` / `text-primary-foreground` / `text-secondary`); кнопки «Правда/Действие» (`from-blue-500`/`from-red-500` градиенты) → `bg-primary text-primary-foreground` / `bg-surface-hover text-text-primary`; финальные результаты и точки truth/dare, счёт, invite-кнопка (`bg-green-600`→`bg-primary`); инфо-панели правил `bg-muted` → `bg-surface border border-border-subtle` (контраст белого текста); пузыри ролеплея — `bg-primary text-primary-foreground` (свои) / `bg-surface-hover text-text-primary` (чужие).
6. **Страницы и компоненты**: `memory-card.tsx` (муз-бейдж `bg-black/55 backdrop-blur-sm`→`bg-background`, play-кнопка `bg-white/85`→`bg-primary`, цитата `text-accent-strong/40`→`text-secondary`), `memory-modal.tsx`, `create-memory-modal.tsx` (выбор ориентации/пропорций `ring-primary/30 bg-primary/5`→`bg-accent`, crop-хендлы `bg-white/90 border-black/30`→`bg-primary border-background`, селект-панели), `chat-page.tsx` (контейнер чата `bg-surface-soft`→`bg-surface`, pill ввода, своя аватарка), `music-page.tsx` (drag-состояния opacity→`bg-surface-hover`, кнопка удаления, пустые состояния), `profile-page.tsx` (иконки Heart/Calendar/MapPin→`text-text-secondary`, danger-кнопка `bg-red-700`→`bg-destructive`), `settings-page.tsx`, `not-found.tsx`, `error-boundary.tsx`, `App.tsx`, `app-shell.tsx` (убран `[DBG]` console.log, `bg-sidebar/95 backdrop-blur`→`bg-sidebar`), `mini-player.tsx`, `sidebar.tsx`, `avatar-upload.tsx` (градиент → `bg-accent-strong`).
7. **`chatBackgrounds.ts`**: все градиентные фоны (blue/green/peach/pink/lightGray/dark) → сплошной `#000000`; ключи и подписи СОХРАНЕНЫ (E2E `settings-save-smoke` ждёт option «Голубой»).
8. **Мёртвые дубликаты** (не импортируются, приведены к монохрому для консистентности): `components/chat-message.tsx`, `components/ui/avatar-upload.tsx`, `components/BottomNav.tsx`, `components/ui/BottomNav.tsx`.

### Дизайн (предыдущая сессия)

1. **Дизайн-токены** (`client/src/index.css`): переписана тёмная тема в графитовой премиальной эстетике; в `.light` добавлены `--sidebar*`; добавлен токен `--accent-text` (светлый accent для текста на тёмных поверхностях — WCAG-контраст). `tailwind.config.ts` получил маппинги `sidebar.*`, `accent-text`.
2. **Новые layout-компоненты** (`client/src/components/layout/`):
   - `app-shell.tsx` — десктоп: левый sidebar `w-64`; мобайл: верхняя панель с `data-testid="mobile-menu-button"` + Sheet-drawer; авто-закрытие drawer при смене route.
   - `sidebar.tsx` — `AppLogo` (∞), кнопка `Добавить` (`aria-label="Добавить воспоминание"`, `title="Добавить"`), `<nav aria-label="Основная навигация">` с роль-линками `Главная/Музыка/Игры/Сообщения/Профиль/Настройки`, мини-плеер, профиль + logout (`data-testid="sidebar-logout"`), `CreateMemoryModal`.
   - `sidebar-nav.tsx`, `mini-player.tsx` (`<nav data-testid="mini-player" aria-label="Мини-плеер">`), `search-input.tsx` (pill-поиск).
3. **`App.tsx`**: убран `BottomNav`/`pb-bottom-nav`; `AppContent = {user ? <AppShell><Router/></AppShell> : <Router/>}`.
4. **Страницы**: переписаны/отполированы `home-page.tsx`, `chat-page.tsx`, `music-page.tsx`, `games-page.tsx`, `profile-page.tsx`, `settings-page.tsx`, `memory-card.tsx`. Старые `BottomNav.tsx`/`ui/BottomNav.tsx` — заглушки (deprecated).

### Стабилизация E2E (последняя сессия)

5. **A11y**: `overflow-x: hidden` → `overflow-x: clip` на `html`/`body` в `client/src/index.css` (правило axe `scrollable-region-focusable` на `<html>` — `hidden` превращал `overflow-y` в scroll-контейнер); 4 toggle-кнопки пароля на `/auth` получили `aria-label` («Показать пароль»/«Скрыть пароль»). Итог: `[a11y:auth]`, `[a11y:privacy]`, `[a11y:terms]` = 0 serious/critical.
6. **Конфликт «Добавить»**: upload-кнопка на `/music` получила `aria-label="Выбрать аудиофайл"` + `title` (sidebar-кнопка `Добавить` — единственный элемент с таким accessible-именем); `e2e/music-upload-smoke.spec.ts` переведён на `getByRole('button', { name: 'Выбрать аудиофайл' })`.
7. **`e2e/nav-after-login.spec.ts`**: перед кликом по `linkProfile` модалка «Создать воспоминание» закрывается через `Escape` + `toBeHidden()` — Radix-диалог (modal) блокировал клик по sidebar.
8. **Game-card testid**: `client/src/pages/games-page.tsx:139` — `data-testid={`game-card-${game.id.replace(/_/g, '-')}`}` (дефисы: `game-card-truth-or-dare`). GameType в `shared/ws-messages.ts` — с подчёркиваниями (`truth_or_dare`), это WS/DB-протокол, НЕ менять.
9. **Чат** (`client/src/pages/chat-page.tsx`, `client/src/components/ui/chat-message.tsx`):
   - `message-input-container` → `chat-input-container` (не пересекается с `[data-testid^="message-"]`).
   - Эфемерное медиа получило testid: `message-<id>-ephemeral-media`, `message-<id>-ephemeral-lock-overlay`, `message-<id>-ephemeral-timer` (+ видимый таймер «Nс» после разблокировки).
   - Вложенные управляющие testid переименованы `${dataTestId}-actions-menu` → `actions-menu-${dataTestId}` (также `edit-action-`, `delete-action-`, `reaction-action-`, `reaction-heart-`, `reaction-count-`, `read-mark-`), чтобы `[data-testid^="message-"].last()` ловил пузырь, а не вложенные кнопки. Эфемерные `message-<id>-ephemeral-*` сохранены (нужны спекам).
10. **Профиль** (`client/src/pages/profile-page.tsx`): `onSubmit` больше НЕ вызывает `form.reset(...)` — `button-save-profile` остаётся enabled после сохранения (контракт спеков). `useEffect`-гидрация формы сбрасывается только при `!isDirty` (не затирает незахранённые правки при refetch `/api/profile`).
11. **Настройки** (`client/src/pages/settings-page.tsx`): `handleChatBackgroundChange`/`handleFontChange` сразу пишут `ui:chatBackground`/`ui:font` в localStorage и шлют `uiSettingsChanged` (как уже делал message font size). Раньше localStorage писался только после async PUT — спека `settings-save-smoke` читала localStorage сразу после клика Save (гонка).
12. **Аватар**: кнопка `button-upload-avatar` в `client/src/components/avatar-upload.tsx` и `client/src/components/ui/avatar-upload.tsx` получила `type="button"` — без него `<button>` внутри `<form>` профиля по умолчанию `type="submit"` и отправлял форму (2× `PUT /api/profile`) вместо открытия файлового пикера.

### Layout и контраст (текущая сессия)

Сквозной аудит «всё видно, ничего не перекрывается» (диагностика собственными Playwright-скриптами, см. «Проверки»). Все правки строго в монохромной палитре (#000/#FFF/#B6B6B6), функционал и API не менялись.

1. **`ui/tabs.tsx`** (глобально: auth, settings, role-playing): `TabsList` был `bg-muted` (#B6B6B6) с `text-muted-foreground` (#B6B6B6) — неактивные вкладки невидимы; активная `bg-background text-foreground` (чёрная пилюля на сером) терялась. Теперь: `border border-border-subtle bg-surface p-1 text-text-secondary gap-1`; активный триггер — `bg-primary text-primary-foreground` (белая пилюля с чёрным текстом), неактивные — #B6B6B6 на чёрном.
2. **`layout/sidebar.tsx`**: шапка/подвал — `shrink-0`, nav — `min-h-0 flex-1 overflow-y-auto`; устранено перекрытие навигации блоком профиля/логаута и мини-плеером на коротких вьюпортах (проверено 300–900px высоты).
3. **`music-page.tsx`** (шапка): поиск был `sm:absolute sm:left-1/2 sm:-translate-x-1/2` и наезжал на кнопку «Выбрать аудиофайл» при 640–1024px. Переведён в честный grid-столбец (`order-2 sm:order-none`, обёртка `w-full sm:max-w-[27rem]`); проверено 390–1440px.
4. **`profile-page.tsx`**: 4 стат-цифры `text-primary-foreground` (чёрный по чёрному) → `text-text-primary`; иконка `text-purple-500` → `text-text-secondary`.
5. **`not-found.tsx`**: светлая тема (`bg-gray-50`, `text-gray-900/600`) → токены `bg-background`/`text-text-primary`/`text-text-secondary` (+ граница карточки).
6. **Игры** (`truth-or-dare`, `role-playing`, `partner-quiz`, `twenty-questions`): серые fallback-бейджи (`bg-gray-100 text-gray-800 dark:…`) → `bg-surface-soft text-text-primary`; статусы «Партнер в игре» `text-primary-foreground` (чёрный на чёрном) → `text-text-primary`.
7. **`memory-card.tsx`**: музыкальные бейджи (иконка + заголовок) `text-primary-foreground` → `text-text-primary` (5 мест).
8. **`ui/chat-message.tsx`**: эфемерный lock-оверлей и timer-бейдж `text-primary-foreground` → `text-text-primary` (файл CRLF — диф минимальный).
9. **`create-memory-modal.tsx`**: футер-полосы превью изображений и кнопка удаления `text-primary-foreground` → `text-text-primary`.
10. **`settings-page.tsx`**: убраны дублирующие классы (`bg-surface text-text-primary … border border-border-subtle`) у `TabsList` — стиль теперь из базовых токенов (файл CRLF — диф минимальный).
11. **`.gitignore`**: добавлены `public/uploads/`, `playwright-report/data`, `playwright-report/trace`, `test-results/`.

## Проверки (актуальное состояние)

- `npm run check` (typecheck) — проходит.
- `npm run lint` / `npm run lint:strict` — чисто (0 ошибок/предупреждений).
- `npm test` — 112 passed (15 файлов); `npm run smoke` — all passed.
- Layout/contrast (текущая сессия): сквозная проверка своими Playwright-скриптами — readability-скан цветов text/effective-bg по AUTH/HOME/CHAT/MUSIC/GAMES/PROFILE/SETTINGS (0 низкоконтрастных элементов), box-overlap-скан (только пустой toaster и намеренный camera-badge на аватаре), мобильный вьюпорт 390px (без горизонтального overflow, drawer без перекрытий), высоты sidebar 300–900px (навигация скроллится, нижняя секция не перекрывается). После фиксов полный E2E перепрогнан — зелёный.
- E2E (Playwright; webServer сам поднимает сервер через `playwright.config.ts`, NODE_ENV=test, MemStorage, RATE_LIMIT_DISABLED=1):
  - Первый полный прогон всех спеков (51): **14 failed / 37 passed / 3 skipped / 2 did not run**.
  - После фиксов (testid chat/games, профиль, настройки, аватар, a11y) перепрогнан батч из 11 спеков: **7 passed / 4 failed**. Passed: `games-all`, `truth-or-dare-smoke`, `role-playing-flow`, `role-playing-smoke`, `partner-quiz-flow`, `chat-ephemeral-media-smoke`, `settings-save-smoke`. Отдельно `avatar-upload-smoke` — **passes**.
  - Финальный полный прогон (эта сессия, после фиксов профиль-ремаунта и `twenty-questions-flow`): **48 passed / 3 skipped / 0 failed**. 3 skipped — runtime-ограничения, не падения: `chat-ephemeral-video-smoke` (видео в headless Chrome), `music-delete-smoke` / `music-edit-meta-smoke` (пустой список треков).
  - ⚠️ Известный флак: `a11y-auth-smoke.spec.ts` / `a11y-smoke.spec.ts` изредка падают по timeout в `beforeEach`/`browserContext.newPage()` в параллельном прогоне — это НЕ axe-нарушения; при воспроизведении перезапустить с `workers: 1`.

## Что осталось (актуальные незавершённые пункты)

Все E2E-падения закрыты — финальный полный прогон зелёный (48 passed / 3 skipped / 0 failed). Layout/contrast-пасс завершён и закоммичен. Осталось только:

- **Косметика** (по желанию): полировка списков музыки, composer в чате, модалок памяти (см. `REDESIGN.md` §9 — желаемое «ощущение»).
- ⚠️ Известный флак `a11y-auth-smoke`/`a11y-smoke` под параллельными воркерами — не чинился (не axe-нарушения), при воспроизведении прогонять с `workers: 1`.

Закрытые в последней сессии пункты (не делать заново):

1. ~~`e2e/chat-ephemeral-smoke.spec.ts`~~ — починен предыдущей сессией (переименование вложенных контролов), прогон зелёный.
2. ~~`e2e/profile-save.spec.ts` / `e2e/profile-username-email.spec.ts`~~ — форма не resettится после сохранения; но главная причина ремаунта оказалась глубже: инлайн `<Suspense>`-элементы в `App.tsx` пересоздавали тип при каждом рендере Router → роутер сбрасывал стейт профиля. Исправлено в `client/src/App.tsx`: инлайн-обёртки вынесены в стабильные компоненты на module scope (`AuthRoute`/`PrivacyRoute`/`TermsRoute`/`HomeRoute`/`MusicRoute`/`GamesRoute`/`MessagesRoute`/`SettingsRoute`/`ProfileRoute`/`NotFoundRoute`). `RouteErrorBoundary` в `protected-route.tsx` менять не потребовалось (он и так был module-scope классом).
3. ~~`e2e/twenty-questions-flow.spec.ts`~~ — `button-set-word` не снимал disabled: WS `partner_status_change` приходит только в момент коннекта сокета, и у игрока, подписавшегося позже, `partnerOnline` оставался `false`. Исправлено в `client/src/components/games/twenty-questions.tsx`: `wsStatusReceivedRef` + `useEffect` по `partnerData` из `/api/partner` досинхронизирует статус из REST-снимка, если WS-события ещё не было.
4. ~~Флаки a11y~~ — не исправлялись (не axe-нарушения), при воспроизведении — `workers: 1`.
5. ~~Полный прогон `npm run -s e2e`~~ — выполнен: 48 passed / 3 skipped / 0 failed.

## Ключевые контракты (не ломать)

- role=link `Главная`/`Музыка`/`Сообщения`/`Профиль`/`Настройки`; кнопка `Добавить` — единственный элемент с этим именем в навигации (upload на /music — `Выбрать аудиофайл`).
- testid: `home-page`, `page-title`, `memories-grid`, `empty-state`, `.flip-card`, `search-input-mobile`/`search-input-desktop`, `music-list`, `music-row-*`, `title="Воспроизвести"`, `settings-page`, `profile-page`, `games-page`, `games-grid`, `game-card-*` (**дефисы**: `game-card-truth-or-dare`, `game-card-twenty-questions`, `game-card-role-playing`, `game-card-partner-quiz`), `button-start-roleplay`/`button-start-quiz`, `button-back`, `auth-page`, `tab-*`, `switch-dark-mode`, `select-font`, `select-chat-background`, `button-save-settings`, `button-reset-settings`, `mobile-menu-button`, `sidebar-logout`, `create-memory-modal-from-sidebar`, `chat-page`, `messages-container`, `message-<id>` (пузырь), `message-<id>-ephemeral-media`/`-ephemeral-lock-overlay`/`-ephemeral-timer`, `chat-input-container`, `button-save-profile` (остаётся enabled после сохранения), `button-upload-avatar`/`input-avatar-file` (`img[alt="Avatar"]` после загрузки).
- GameType (`shared/ws-messages.ts`): `truth_or_dare`, `twenty_questions`, `partner_quiz`, `role_playing` — подчёркивания, WS/DB-протокол, НЕ менять.
- A11y: 0 serious/critical на `/auth`, `/privacy`, `/terms`; видим `main,form,[role="main"]`.
- Мини-плеер — `<nav data-testid="mini-player">` внутри sidebar (слева), на мобайле в drawer.

## Команды

- `npm run check` / `npm run lint` / `npm run verify` (строгий: check+lint:strict+test+smoke)
- `npm run -s e2e -- -g "паттерн"` — выборочный; без -g — все
- Одиночный спек: `npx playwright test e2e/<файл>.spec.ts --reporter=list` (webServer поднимается сам)
- Playwright-браузер установлен (chromium 1187, system deps готовы).

## Контекст архитектуры

- Сервер НЕ менять. `storage.ts` (IStorage Mem/Pg), CSRF (`queryClient.ts` — всегда через `apiRequest`/`csrfFetch`/`csrfUploadFetch`), сессии cookie, `/ws` WebSocket (типизированные сообщения в `shared/schema.ts`).
- Path-алиасы `@` → `client/src`, `@shared` → `shared` (tsconfig + vite + vitest).
- `theme-provider.tsx`: классы `light`/`dark`, storageKey `app-theme`.
- `useAudioPlayer`: `playTrack`, `playList`, `next`, `prev`, `toggle`, `seek`, `setVolume`, `setRepeat`, `toggleShuffle`, `close`, `current`, `queue`, `index`.
- `e2e/utils.ts`: `registerViaApi`, `loginUI`, `createInvite`, `registerPartnerWithInvite`, `openGame(page, 'game-card-…')`.

## Файлы (состояние после layout/contrast-сессии)

Layout/contrast-пасс закоммичен: `client/src/components/ui/tabs.tsx`, `layout/sidebar.tsx`, `pages/music-page.tsx`, `pages/profile-page.tsx`, `pages/not-found.tsx`, `components/games/{truth-or-dare,role-playing,partner-quiz,twenty-questions}.tsx`, `components/memory-card.tsx`, `components/ui/chat-message.tsx`, `components/create-memory-modal.tsx`, `pages/settings-page.tsx`, а также `.gitignore` (артефакты прогонов) и этот `HANDOFF.md`. Рабочая директория чистая.

Артефакты прогонов игнорируются через `.gitignore` (не коммитить): `public/uploads/`, `playwright-report/data`, `playwright-report/trace`, `test-results/`.
