# Раздача с учётом прошлых игр — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** вторая кнопка раздачи, которая по играм текущего игрового дня выравнивает шансы номеров на активные роли и реже повторяет номеру ту же роль.

**Architecture:** чистая взвешенная раздача в движке (`src/engine/deal.ts`); отбор учтённых игр и граница отсчёта — в приложении (`src/app`), потому что им нужны хранилище и часы; экраны состава и раздачи только зовут действия хранилища состояния. Способ раздачи записывается в событие `roles_dealt`.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, приёмочный сценарий на Chrome без окна.

**Spec:** `docs/superpowers/specs/2026-11-22-history-aware-deal-design.md`

## Global Constraints

- Слои `ui → app → engine`; движок чистый: без часов, хранилища и `Date`. Случайность — только внешний `RandomInt`.
- Идентификаторов ролей, сторон и опций вне `src/engine/roles/` нет (`tests/engine/purity.test.ts`).
- Источник правды — журнал событий; старые сохранения читаются без изменений (поле `history` необязательное).
- Вес делится на 3 за каждую активную игру и ещё на 3 за каждый повтор роли; разница показателей обрезается до 8.
- Активная роль — роль с ночным действием; одна и та же роль — одно название на столе (`displayAs ?? id`).
- Игровой день — с 6:00 до 6:00 по местному времени; учитываются игры, дошедшие до Ночи 1.
- Все строки — на русском и украинском. Сначала падающий тест, потом код. `npm run check`, `npm run build`, `npm run acceptance` зелёные перед коммитом.

## Review Focus

- Сумма весов шире диапазона генератора подвешивает вкладку: показатели нормируются и обрезаются до раздачи, а не после.
- Счётчик на экране и раздача считают разное: обе стороны берут учтённые игры из одной функции, раздача пересчитывает её в момент нажатия.
- Граница отсчёта пропадает после перезагрузки страницы: поле `dealHistoryFrom` должно пройти через чтение настроек хранилищем.
- Игра, брошенная в День 1, или текущая игра попадает в учёт и перекашивает раздачу.
- Двойной Enter после перераздачи начинает День 1 по раскладу, который ведущий не увидел.

---

### Task 1: Движок — счётчики по номерам и раздача по весам

**Files:** Modify `src/engine/deal.ts`; Test `tests/engine/deal-history.test.ts`.

**Interfaces — Produces:**

```ts
export type PastDeal = { roles: readonly RoleId[]; registry: Registry }
export type SeatHistory = { active: number; played: Record<RoleId, number> }
export const HISTORY_FACTOR = 3
export const HISTORY_MAX_SPREAD = 8
export function seatHistory(games: readonly PastDeal[], seats: number): SeatHistory[]
export function dealWithHistory(deck: readonly RoleId[], history: readonly SeatHistory[], registry: Registry, randomInt: RandomInt): RoleId[]
```

- [x] Тесты `seatHistory`: активная игра считается по ночному действию в перечне той игры; мафия и глава мафии — один ключ `played`; бронежилет — в `played`, но не в `active`; мирный не считается; номера сверх прошлой игры — с нулями, лишние номера прошлой игры отброшены; удалённая своя ночная роль считается по перечню своей игры.
- [x] Тесты `dealWithHistory`: результат — перестановка колоды при любой истории; пустая история на 20 000 раздач с `seededInt` — доля активных у каждого номера в пределах ±3 п.п. от равной; история «пятеро играли» — новый номер получает активную роль чаще игравшего не менее чем вдвое; бывший шериф получает шерифа реже бывшего доктора; бронежилет реже повторяется, но не влияет на шанс активной роли; две карты мафии; колода без мирных и из одних мирных; `randomInt`, который бросает исключение при `maxExclusive > 2 ** 32`, на истории «у одного номера 30 активных игр» при 20 местах; 15 игр подряд — отстающий номер сохраняет преимущество.
- [x] Реализация: активные карты в случайном порядке, затем особые без ночного хода, затем остаток; выбор номера — целые веса `3^(8 − min(8, показатель − минимум))`.
- [x] `npx vitest run tests/engine/deal-history.test.ts` — зелёный; коммит не делается до конца работы (один коммит на функцию, как принято в репозитории).

### Task 2: Событие раздачи и журнал

**Files:** Modify `src/engine/types.ts`, `src/engine/commands.ts`, `src/engine/journal.ts`, `src/app/i18n/journalText.ts`, `src/app/i18n/index.ts`, `src/app/i18n/ru.ts`, `src/app/i18n/uk.ts`; Test `tests/engine/deal-history.test.ts`, `tests/engine/journal.test.ts`.

**Interfaces — Produces:** команда `{ type: 'deal'; assignment: RoleId[]; history?: number }`; событие `roles_dealt { assignment; history?: number }`; запись журнала `{ kind: 'deal'; counts; history: number }` (0 — случайная); `plural(lang, n, 'pastGames')`.

- [x] Тесты: команда с `history: 3` пишет событие с полем, без него — без поля; перераздача заменяет поле; текст журнала «Роли розданы с учётом 3 прошлых игр: …» и «…1 прошлой игры…», на украинском — «з урахуванням 3 минулих ігор».
- [x] Реализация и строки `journal.deal.history`, `pastGames.one|few|many`.

### Task 3: Приложение — учтённые игры, режимы раздачи, граница отсчёта

**Files:** Create `src/app/dealHistory.ts`; Modify `src/app/store.ts`, `src/platform/storage.ts`; Test `tests/app/deal-history.test.ts`.

**Interfaces — Produces:**

```ts
// src/app/dealHistory.ts
export function gameDayStart(now: number): number                 // ближайшие прошедшие 6:00 по местному времени
export function reachedNight(phase: PhaseRef): boolean            // Ночь 1 и дальше
// src/platform/storage.ts
Settings.dealHistoryFrom: number | null
// src/app/store.ts
export type DealMode = 'random' | 'history'
export type DealHistory = { games: { id: string; createdAt: number; playerCount: number }[]; resetAt: number | null }
AppStore.dealHistory(): DealHistory          // игры от ранней к поздней; resetAt — граница, если она в силе
AppStore.dealDraft(mode?: DealMode): void
AppStore.redeal(mode?: DealMode): CommandResult
AppStore.resetDealHistory(): void
AppStore.restoreDealHistory(): void
```

- [x] Тесты отбора: игра, дошедшая до Ночи 1, учтена; брошенная в День 1, оставшаяся на раздаче, удалённая, нечитаемая, вчерашняя (до 6:00) и текущая — нет; игра в 23:30 учтена в 01:00 следующих суток; несохранённая игра (хранилище отказало) учтена; роли берутся после обмена; граница отсчёта отсекает прежние игры, «вернуть» возвращает; граница переживает пересоздание приложения на том же хранилище и теряет силу на следующий игровой день.
- [x] Тесты раздачи: `dealDraft('history')` пишет `history: N` и раздаёт по весам (с `randomInt` из `seededInt` новый номер получает активную роль чаще на серии раздач); без учтённых игр — обычная раздача без поля; `dealDraft()` без режима — как раньше; `redeal('history')` отменяется одной отменой и не работает после начала Дня 1.
- [x] Реализация: одна внутренняя функция отбора, из неё и `dealHistory()`, и обе раздачи.

### Task 4: Экран состава

**Files:** Modify `src/ui/screens/SetupScreen.tsx`, `src/ui/screens/prepare.css`, строки; Test `tests/ui/deal-history.test.tsx`, правка `tests/ui/prepare.test.tsx`, `custom-setup.test.tsx`, `new-roles-setup.test.tsx`.

- [x] Тесты: две кнопки; без истории вторая недоступна и видна строка «Сегодня ещё не было игр, дошедших до ночи»; с историей — «Учтено игр: 2 (19:05, 20:10)»; «Начать отсчёт заново» прячет счётчик и показывает «Отсчёт начат заново в 21:05» с «Вернуть»; «Вернуть» возвращает счётчик; предупреждение о числе мест; клик по второй кнопке раздаёт с `history`; Enter раздаёт случайно; украинские подписи.
- [x] Реализация; подпись `setup.deal` — «Раздать случайно».

### Task 5: Экран раздачи

**Files:** Modify `src/ui/screens/DealScreen.tsx`, строки; Test `tests/ui/deal-history.test.tsx`, правка `tests/ui/prepare.test.tsx`, `custom-game.test.tsx`.

- [x] Тесты: строка «Роздано случайно» / «Роздано с учётом 2 прошлых игр»; окно «Перераздать» с двумя кнопками, вторая недоступна без истории; Enter в окне ничего не раздаёт; после перераздачи Enter начинает День 1 только через 0,4 с.
- [x] Реализация через `store.redeal(mode)`.

### Task 6: Приёмка, документы, снимки

**Files:** Modify `scripts/acceptance.mjs`, `README.md`, `docs/acceptance.md`, спецификация; Create снимки в `docs/design/screens/`.

- [x] Шесть нажатий «Раздать роли» в сценарии → «Раздать случайно»; шаг 17 по разделу 6 спецификации.
- [x] README: раздел «Раздача с учётом прошлых игр»; `docs/acceptance.md`: раздел и строка таблицы шагов.
- [x] `npm run check`, `npm run build`, два прогона `npm run acceptance`; независимая проверка правки агентами; один коммит.
