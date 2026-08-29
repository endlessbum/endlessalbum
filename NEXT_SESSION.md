Продолжение работы над редизайном Endlessalbum в /workspace по REDESIGN.md. Сначала прочитай PROJECT BASE.txt, затем CLAUDE.md, затем HANDOFF.md (там полное описание сделанного, контракты и команды), затем REDESIGN.md.

Сделано: тёмная премиальная монохромная тема (строго #000/#FFF/#B6B6B6), левый sidebar + mobile drawer вместо нижнего бара (client/src/components/layout/*), переписаны App/home/chat/music/games/profile/settings, мини-плеер перенесён в sidebar. Всё закоммичено в единственный коммит репо `4f4bb42 Initial commit`.

Финальная сессия — полный монохромный pass дизайн-системы: переписаны токены в client/src/index.css (без градиентов/glow/alpha-оттенков, все --shadow-* = transparent), ThemeProvider → dark-only (defaultTheme="dark"; классы light/dark переключаются только для E2E settings-appearance, палитра едина), почищены ui/* (кнопки/бейджи/тосты/диалоги/оверлеи), игры (цветные бейджи/статусы/кнопки «Правда/Действие» → монохром), страницы и memory-компоненты (оверлеи bg-black/55 → bg-background, контрасты на #B6B6B6 починены), chatBackgrounds → сплошной #000 (ключи/подписи сохранены — E2E ждёт option «Голубой»). npm run check, npm run lint:strict, npm test (112 passed), npm run smoke — зелёные.

Стабилизация E2E (из предыдущих сессий): первый полный прогон был 14 failed / 37 passed. Исправлено: testid game-card-* теперь с дефисами (games-page), message-input-container → chat-input-container, вложенные контролы сообщений переименованы на префиксы actions-menu-<id> и т.п. (чтобы [data-testid^="message-"].last() ловил пузырь), добавлены testid эфемерного медиа (-ephemeral-media/-lock-overlay/-timer); profile: форма не resettится после сохранения (button-save-profile остаётся enabled); settings: ui:chatBackground/ui:font пишутся в localStorage сразу на select; avatar: кнопка загрузки type="button"; upload на /music переименован в «Выбрать аудиофайл», nav-after-login закрывает модалку через Escape; a11y: overflow-x: clip, aria-label на toggle-кнопках пароля.

Последняя сессия — финальный прогон E2E зелёный: **48 passed / 3 skipped / 0 failed** (3 skipped — только runtime-спеки: видео-эфемерные сообщения в headless Chrome, music delete/edit при пустом списке треков). Исправлены последние падения:
1. Профиль ремаунтился после сохранения (роутеры сбрасывали состояние формы): в client/src/App.tsx инлайн-элементы <Suspense>…</Suspense> заменены на стабильные компоненты-обёртки на module scope (AuthRoute/HomeRoute/…/NotFoundRoute), чтобы ProtectedRoute не пересоздавал тип элемента при каждом рендере Router.
2. «20 вопросов»: partnerOnline оставался false у игрока, загадывающего слово, если WS partner_status_change пришёл до подписки компонента → в client/src/components/games/twenty-questions.tsx добавлена досинхронизация из REST-снимка /api/partner (wsStatusReceivedRef + useEffect по partnerData), myWord-стейт обновляется корректно и button-set-word снимает disabled.
3. Убран отладочный [DBG]-лог монтирования профиля (client/src/pages/profile-page.tsx).

Не закоммичено (только эти 3 файла + прочистка public/uploads/; сам редизайн уже в Initial commit):
- `client/src/App.tsx`
- `client/src/components/games/twenty-questions.tsx`
- `client/src/pages/profile-page.tsx`

Перед сдачей: npm run check, npm run lint, при желании полный npm run -s e2e. Единственный известный риск: 2 a11y-спека (a11y-auth-smoke, a11y-smoke) изредка флакуют по timeout в beforeEach при параллельном прогоне — при воспроизведении перезапустить с workers: 1; это не axe-нарушения.
