# Помощник ведущего «Мафии» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница-журнал для ведущего живой «Мафии»: состав, раздача, ночи и дни с таймерами, голосование, журнал с правкой, сохранение в браузере.

**Architecture:** Игровая логика — чистый TypeScript в `src/engine`: журнал событий является источником истины, состояние стола каждый раз выводится функцией `deriveState`. Интерфейс шлёт команды, команда превращается в пачку событий, пачка отменяется целиком. Роли, стороны и ночные действия описаны данными в справочнике. Поверх движка — маленький store и React-компоненты без роутера и UI-кита.

**Tech Stack:** Vite, React, TypeScript (strict), Vitest, React Testing Library, ESLint, vite-plugin-singlefile, шрифты через @fontsource.

**Spec:** `docs/superpowers/specs/2026-11-14-mafia-host-design.md`. Исходное ТЗ и ответы заказчика: `docs/superpowers/specs/2026-11-14-mafia-host-brief.md`. Макеты: `docs/design/mockups/*.dc.html` (читать как справочник по разметке, цветам и текстам).

## Global Constraints

- Статическая страница без сервера. Сборка — один самодостаточный `dist/index.html`, который открывается с диска в актуальных Chrome и Safari и ничего не грузит из сети, включая шрифты.
- Ноутбук: расчётная ширина окна от 1280 px, не ломается до 1024 px.
- От 4 до 20 игроков, игроки — номера без имён.
- Интерфейс на русском и украинском. Все строки и названия ролей только в словарях `src/app/i18n/ru.ts` и `uk.ts` с одинаковыми ключами.
- Словарь заказчика в текстах: балаган, выставить, оправдание, прощание, выбыл, застрелен, выгнан, чёрные, красные, распределение.
- Ничего не происходит само: фаза, шаг, статус игрока и таймер меняются только действием ведущего. По нулю таймера — сигнал, слово не передаётся.
- Единственный жёсткий запрет в игре — сумма голосов больше числа голосующих. Остальные ограничения — предупреждение с кнопкой «Записать всё равно».
- `src/engine` не импортирует React, `src/platform`, `src/app`, `src/ui` и не обращается к `Date.now`, `new Date()`, `Math.random`, `document`, `window`, `localStorage`, `crypto`. Время, идентификаторы и случайность приходят параметрами.
- Сравнение с литералом идентификатора роли или стороны разрешено только в `src/engine/roles/`.
- Состояние стола не хранится: в сессии лежат настройки и журнал, всё остальное выводит `deriveState`.
- Без роутера, без библиотеки состояния, без UI-кита. Обычный CSS с переменными; цвета, шрифты и размеры — из раздела 6.10 спецификации.
- Длительности по умолчанию в секундах: речь 60, балаган 60, оправдание 30, речь при ничьей 30, прощание 30.
- Окно подтверждения есть только у трёх действий: перераздать роли, остановить игру, удалить сессию.
- Перед каждым коммитом проходит `npm run check`.

## Review Focus

1. **Хранилище недоступно или переполнено** (`setItem` бросает исключение, приватное окно Safari): игра продолжается в памяти, в шапке видно предупреждение, приложение не падает. Тест — в задачах 10 и 12.
2. **Автоповтор Enter и двойной клик по главной кнопке**: шаг не проскакивает в течение 0,4 с после смены шага; горячие клавиши не срабатывают под открытым окном и в поле ввода. Тест — в задаче 14.
3. **Статус игрока меняется посреди голосования** (кандидат или голосующий выбыл либо возвращён): число голосующих и остаток пересчитываются; если уже введённых голосов стало больше, чем голосующих, показывается предупреждение, а не падение. Тест — в задаче 6.
4. **Журнал с «висячими» ссылками после правок и отмен** (удалён автор выставления, остались голоса за снятого кандидата, ночное действие выбывшего): `deriveState` не бросает исключений. Тест — в задаче 8.
5. **Ноутбук уснул или вкладка была в фоне во время речи**: после пробуждения таймер сразу показывает верный остаток или перерасход, сигнал звучит не больше одного раза. Тест — в задачах 9 и 14.

## Структура файлов

```
index.html, package.json, vite.config.ts, tsconfig*.json, eslint.config.js
src/main.tsx                      точка входа: собирает Env браузера и рисует App
src/engine/
  types.ts                        все типы движка
  roles/registry.ts               DEFAULT_REGISTRY: стороны, роли, ночные действия
  roles/rules.ts                  правила, которым нужны литералы сторон и ролей
  setup.ts                        состав: умолчания, проверка, колода
  deal.ts                         перемешивание и раздача
  log.ts                          фазы, применение пачки событий, отмена
  commands.ts                     execute(): команда ведущего → пачка событий
  derive.ts                       deriveState(), playersAt()
  day.ts                          круг речей, выставление, очереди оправданий и прощаний
  vote.ts                         туры голосования, остаток, подсказка исхода
  night.ts                        шаги ночи из справочника, ответы, итог ночи
  journal.ts                      журнал для показа: группы и записи
  timer.ts                        таймер по моменту окончания
  index.ts                        публичный интерфейс движка
src/platform/                     rng.ts, storage.ts, sound.ts, wakeLock.ts
src/app/
  store.ts                        состояние приложения, dispatch, undo, сохранение
  env.ts                          Env для браузера
  i18n/index.ts, ru.ts, uk.ts     словари и t()
  i18n/journalText.ts             запись журнала → строка
src/ui/
  App.tsx
  screens/                        HomeScreen, SetupScreen, DealScreen, GameScreen, SummaryScreen
  game/                           Header, Table, PlayerCard, PlayerPanel, JournalPanel, RecordEditor,
                                  PauseCurtain, StepNav, MainButton, TimerPanel, SpeechPanel,
                                  NominationList, VotePanel, TieDecision, NightPanel, NightSummary, StopDialog
  common/                         Button, Dialog, Stepper, useHotkeys
src/styles/                       tokens.css, base.css; стили компонента лежат рядом с компонентом
tests/
  helpers.ts                      game(), play(), st(), seededInt() и стол TABLE_11
  engine/*.test.ts, platform/*.test.ts, app/*.test.ts, ui/*.test.tsx
  scenarios/full-game.test.ts
```

Зависимости направлены в одну сторону: `ui → app → engine`, `platform` подключается только в `app`.

Стол для тестов `TABLE_11`: №1 шериф, №3 крёстный отец, №4 доктор, №8 мафия, №10 проститутка, остальные мирные. Тот же стол нарисован на макетах.

---

### Task 1: Каркас проекта

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `index.html`, `.gitignore`, `src/main.tsx`, `src/ui/App.tsx`, `src/styles/tokens.css`, `src/styles/base.css`, `tests/setup.ts`
- Test: `tests/engine/purity.test.ts`

**Interfaces:**
- Produces: команды `npm run dev`, `npm run build`, `npm run test`, `npm run lint`, `npm run check` (= `tsc -b && eslint . && vitest run`); переменные CSS из раздела 6.10 спецификации с именами `--bg`, `--panel`, `--card`, `--border`, `--border-strong`, `--text`, `--text-2`, `--text-3`, `--day`, `--day-ink`, `--day-tint`, `--night`, `--night-ink`, `--night-tint`, `--red`, `--black`, `--alert`, `--alert-tint`, `--font-ui`, `--font-num`.

- [x] **Step 1: Создай каркас.** Сгенерируй шаблон Vite `react-ts` во временной папке и перенеси его файлы в корень проекта, не трогая `docs/`. Установи dev-зависимости `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `vite-plugin-singlefile` и зависимости `@fontsource/golos-text`, `@fontsource/oswald`. Если пакета шрифта в npm нет, положи woff2 в `src/styles/fonts/` и подключи через `@font-face`.

- [x] **Step 2: Настрой сборку и тесты.** В `vite.config.ts`: плагины `react()` и `viteSingleFile()`, `base: './'`, блок `test` с `environment: 'jsdom'`, `setupFiles: ['tests/setup.ts']`, `include: ['tests/**/*.test.{ts,tsx}']`. В `tests/setup.ts` подключи `@testing-library/jest-dom/vitest`. В `tsconfig` включи `strict`, `noUncheckedIndexedAccess`.

- [x] **Step 3: Настрой границы слоёв в ESLint.** Для `src/engine/**`: `no-restricted-imports` на `react`, `react-dom` и пути `platform`, `app`, `ui`; `no-restricted-globals` на `document`, `window`, `localStorage`, `navigator`, `crypto`; `no-restricted-properties` на `Date.now` и `Math.random`; `no-restricted-syntax` на `new Date()`.

- [x] **Step 4: Напиши тест на литералы ролей**

```ts
// tests/engine/purity.test.ts
test('идентификаторы ролей и сторон не встречаются вне src/engine/roles', () => {
  const offenders = sourceFiles('src').filter((f) => !f.includes('src/engine/roles/'))
    .filter((f) => /['"`](civilian|mafia|godfather|prostitute|sheriff|doctor|red|black)['"`]/.test(read(f)));
  expect(offenders).toEqual([]);
});
```

`sourceFiles` и `read` — локальные помощники теста на `node:fs`, обходят `.ts` и `.tsx`.

- [x] **Step 5: Заполни стили и заглушку.** `tokens.css` — переменные со значениями из таблицы 6.10; `base.css` — фон, цвет, шрифт, сброс кнопок, видимый фокус. Шрифты импортируй только с подмножествами `latin` и `cyrillic` (точные пути — в README пакетов). `App.tsx` пока рисует заголовок «Мафия».

- [x] **Step 6: Проверь границы и сборку**

Run: `npm run check`
Expected: PASS.

Временно добавь `Date.now()` в любой файл `src/engine/`, запусти `npm run lint` — ожидается ошибка `no-restricted-properties`; убери строку.

Run: `npm run build && ls dist && grep -c "googleapis" dist/index.html`
Expected: в `dist` один файл `index.html`, grep печатает `0`.

- [x] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "chore: каркас проекта, границы слоёв, сборка в один файл"
```

---

### Task 2: Справочник ролей и состав

**Files:**
- Create: `src/engine/types.ts`, `src/engine/roles/registry.ts`, `src/engine/setup.ts`
- Test: `tests/engine/setup.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export type Seat = number; export type RoleId = string; export type SideId = string;
export type EffectId = 'kill' | 'heal' | 'block' | 'check_side' | 'find_role';
export type SideDef = { id: SideId; nameKey: string; colorVar: string; ring?: true };   // colorVar — переменная CSS для точки стороны
export type RoleDef = {
  id: RoleId; nameKey: string; side: SideId;
  filler?: true;            // добирает остаток
  defaultCount: number;
  countsWithin?: RoleId;    // входит в счётчик другой роли в составе
  exactCount?: number;      // сколько таких внутри родителя
  displayAs?: RoleId;       // чьим названием показана на столе
  markKey?: string;         // ключ пометки на карточке
  seenBySheriffAs: SideId;
};
export type NightActionDef = {
  id: string; order: number; effect: EffectId;
  performers: RoleId[]; scope: 'team' | 'each';
  leader?: RoleId;          // блок лидера отменяет командное действие
  inheritedBy?: RoleId;     // кто выполняет, когда живых performers нет
  findRole?: RoleId;        // для find_role
  noRepeatTarget?: true;
  stepKey: string; questionKey: string;
};
export type Registry = { sides: SideDef[]; roles: RoleDef[]; nightActions: NightActionDef[] };

// setup.ts
export const MIN_PLAYERS = 4; export const MAX_PLAYERS = 20;
export type SetupIssue = 'players_out_of_range' | 'too_many_roles' | 'no_killer' | 'black_not_less_than_red';
export function defaultComposition(registry: Registry): Record<RoleId, number>;
export function checkComposition(playerCount: number, composition: Record<RoleId, number>, registry: Registry):
  { errors: SetupIssue[]; warnings: SetupIssue[]; deck: RoleId[]; civilians: number; bySide: Record<SideId, number> };
```

`DEFAULT_REGISTRY` в `roles/registry.ts`:

| Роль | side | defaultCount | Особые поля |
|---|---|---|---|
| `civilian` | red | 0 | `filler` |
| `mafia` | black | 1 | — |
| `godfather` | black | 0 | `countsWithin: 'mafia'`, `exactCount: 1`, `displayAs: 'mafia'`, `markKey: 'mark.head'` |
| `prostitute` | black | 1 | — |
| `sheriff` | red | 1 | — |
| `doctor` | red | 1 | — |

`seenBySheriffAs` равно стороне роли. Стороны: `red` с `colorVar: '--red'`; `black` с `colorVar: '--black'` и `ring`. Интерфейс рисует точку стороны только по этим полям.

| Действие | order | effect | performers | scope | Особые поля |
|---|---|---|---|---|---|
| `mafia_shot` | 10 | kill | mafia, godfather | team | `leader: 'godfather'`, `inheritedBy: 'prostitute'` |
| `godfather_search` | 15 | find_role | godfather | each | `findRole: 'sheriff'` |
| `prostitute_block` | 20 | block | prostitute | each | — |
| `sheriff_check` | 30 | check_side | sheriff | each | — |
| `doctor_heal` | 40 | heal | doctor | each | `noRepeatTarget` |

- [ ] **Step 1: Write the failing test**

```ts
const std = { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 };
test('по умолчанию каждой роли по одной', () => {
  expect(defaultComposition(DEFAULT_REGISTRY)).toEqual({ mafia: 1, prostitute: 1, sheriff: 1, doctor: 1 });
});
test('11 игроков, 2 мафии: один крёстный отец внутри числа мафий, 6 мирных', () => {
  const r = checkComposition(11, std, DEFAULT_REGISTRY);
  expect(countBy(r.deck)).toEqual({ godfather: 1, mafia: 1, prostitute: 1, sheriff: 1, doctor: 1, civilian: 6 });
  expect(r.civilians).toBe(6); expect(r.bySide).toEqual({ black: 3, red: 8 }); expect(r.errors).toEqual([]);
});
test('одна мафия — это крёстный отец', () => {
  expect(countBy(checkComposition(10, { ...std, mafia: 1 }, DEFAULT_REGISTRY).deck).mafia).toBeUndefined();
});
test('ролей больше, чем игроков — ошибка', () => {
  expect(checkComposition(4, std, DEFAULT_REGISTRY).errors).toEqual(['too_many_roles']);
});
test('границы числа игроков', () => {
  expect(checkComposition(3, {}, DEFAULT_REGISTRY).errors).toContain('players_out_of_range');
  expect(checkComposition(21, {}, DEFAULT_REGISTRY).errors).toContain('players_out_of_range');
});
test('предупреждения состава', () => {
  expect(checkComposition(8, { ...std, mafia: 0, prostitute: 0 }, DEFAULT_REGISTRY).warnings).toContain('no_killer');
  expect(checkComposition(4, { mafia: 2 }, DEFAULT_REGISTRY).warnings).toContain('black_not_less_than_red');
});
```

`countBy` добавь в `tests/helpers.ts`: `(xs: string[]) => Record<string, number>`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/setup.test.ts`
Expected: FAIL, модули не найдены.

- [ ] **Step 3: Реализуй типы, справочник и `setup.ts`.** `no_killer` — в колоде нет ни одного носителя действия с эффектом `kill`. Правило «чёрных не меньше красных» вынеси в `src/engine/roles/rules.ts` как `export function blackNotLess(bySide: Record<SideId, number>): boolean` — литералы сторон живут там.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/setup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): справочник ролей и проверка состава"
```

---

### Task 3: Раздача

**Files:**
- Create: `src/engine/deal.ts`, `src/platform/rng.ts`
- Test: `tests/engine/deal.test.ts`, `tests/platform/rng.test.ts`

**Interfaces:**
- Consumes: `checkComposition(...).deck`.
- Produces:

```ts
export type RandomInt = (maxExclusive: number) => number;
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[];   // Фишер–Йетс, возвращает новый массив
export function dealRoles(deck: readonly RoleId[], randomInt: RandomInt): RoleId[];   // индекс = номер игрока − 1
// platform/rng.ts
export const cryptoRandomInt: RandomInt;   // crypto.getRandomValues, значения вне кратного диапазона отбрасываются
```

- [ ] **Step 1: Write the failing test**

```ts
const deck = checkComposition(11, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }, DEFAULT_REGISTRY).deck;
test('раздача детерминирована при фиксированном зерне', () => {
  expect(dealRoles(deck, seededInt(42))).toEqual(dealRoles(deck, seededInt(42)));
  expect(dealRoles(deck, seededInt(42))).not.toEqual(dealRoles(deck, seededInt(43)));
});
test('10 000 раздач: состав всегда равен колоде, мафий ровно две', () => {
  const rnd = seededInt(1);
  for (let i = 0; i < 10_000; i++) expect(countBy(dealRoles(deck, rnd))).toEqual(countBy(deck));
});
test('крёстный отец попадает на место №1 примерно в 1/11 раздач', () => {
  const rnd = seededInt(7); let hits = 0;
  for (let i = 0; i < 11_000; i++) if (dealRoles(deck, rnd)[0] === 'godfather') hits++;
  expect(hits).toBeGreaterThan(850); expect(hits).toBeLessThan(1150);
});
test('shuffle не меняет исходный массив', () => {
  const src = [1, 2, 3, 4]; shuffle(src, seededInt(3)); expect(src).toEqual([1, 2, 3, 4]);
});
// tests/platform/rng.test.ts
test('cryptoRandomInt остаётся в диапазоне', () => {
  for (let i = 0; i < 2000; i++) { const v = cryptoRandomInt(7); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(7); }
});
```

`seededInt(seed): RandomInt` добавь в `tests/helpers.ts` (mulberry32).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/deal.test.ts tests/platform/rng.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализуй `shuffle`, `dealRoles`, `cryptoRandomInt`.** Сортировка со случайным компаратором и независимый жребий на игрока запрещены.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/deal.test.ts tests/platform/rng.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): честная раздача ролей"
```

---

### Task 4: Журнал событий и отмена

**Files:**
- Modify: `src/engine/types.ts`
- Create: `src/engine/log.ts`
- Test: `tests/engine/log.test.ts`

**Interfaces:**
- Produces:

```ts
export type PhaseRef = { kind: 'deal' } | { kind: 'day'; n: number } | { kind: 'night'; n: number };
export type DayStep = 'balagan' | 'speeches' | 'defense' | 'vote' | 'tiebreak' | 'revote' | 'farewell';
export type StepId = string;                       // DayStep, id ночного шага или 'summary'
export type SpeechKind = 'balagan' | 'speech' | 'defense' | 'tiebreak' | 'farewell';
export type OutCause = 'shot' | 'voted';
type Ev<T extends string, P> = { id: string; seq: number; tx: string; phase: PhaseRef; edited?: true; manual?: true; type: T } & P;
export type GameEvent =
  | Ev<'roles_dealt', { assignment: RoleId[] }>
  | Ev<'roles_swapped', { a: Seat; b: Seat }>
  | Ev<'phase_started', {}>
  | Ev<'step_entered', { step: StepId }>
  | Ev<'night_action', { actionId: string; actor: Seat | null; target: Seat | null }>
  | Ev<'night_confirmed', { hinted: Seat | null; chosen: Seat | null }>
  | Ev<'status_set', { seat: Seat; status: 'alive' | 'out'; cause?: OutCause; source: 'night' | 'vote' | 'manual' }>
  | Ev<'circle_opened', { first: Seat }>
  | Ev<'speech_started', { kind: SpeechKind; seat: Seat | null }>
  | Ev<'speech_ended', { startId: string }>
  | Ev<'speaker_skipped', { seat: Seat }>
  | Ev<'nominated', { by: Seat | null; target: Seat; order: number }>
  | Ev<'votes_set', { ballot: 1 | 2; candidate: Seat; count: number }>
  | Ev<'voters_set', { ballot: 1 | 2; count: number }>
  | Ev<'vote_resolved', { ballot: 1 | 2; outcome: 'eliminated' | 'tie' | 'nobody'; seats: Seat[] }>
  | Ev<'game_finished', { winner: SideId | null }>;
export type NewEvent = GameEvent extends infer E ? E extends GameEvent ? Omit<E, 'id' | 'seq' | 'tx'> : never : never;
export type LogPatch = { add: NewEvent[]; replace: GameEvent[]; remove: string[] };
export type UndoEntry = { added: string[]; replaced: GameEvent[]; removed: GameEvent[] };

// log.ts
export const EMPTY_PATCH: LogPatch;
export function phaseOrder(p: PhaseRef): number;      // deal 0, day n → 2n − 1, night n → 2n
export function nextPhase(p: PhaseRef): PhaseRef;     // deal → day 1 → night 1 → day 2 → …
export function samePhase(a: PhaseRef, b: PhaseRef): boolean;
export function applyPatch(log: GameEvent[], patch: LogPatch, nextSeq: number, newId: () => string):
  { log: GameEvent[]; nextSeq: number; undo: UndoEntry };
export function applyUndo(log: GameEvent[], entry: UndoEntry): GameEvent[];
```

Журнал всегда отсортирован по `seq`. Все события одной пачки получают общий `tx`. Событие из `replace` сохраняет `id` и `seq` оригинала и получает `edited: true`.

- [ ] **Step 1: Write the failing test**

```ts
const day1: PhaseRef = { kind: 'day', n: 1 };
const ids = () => { let i = 0; return () => `e${++i}`; };
test('порядок и смена фаз', () => {
  expect([{ kind: 'deal' }, day1, { kind: 'night', n: 1 }, { kind: 'day', n: 2 }].map(phaseOrder)).toEqual([0, 1, 2, 3]);
  expect(nextPhase({ kind: 'deal' })).toEqual(day1);
  expect(nextPhase(day1)).toEqual({ kind: 'night', n: 1 });
  expect(nextPhase({ kind: 'night', n: 1 })).toEqual({ kind: 'day', n: 2 });
});
test('пачка получает id, возрастающий seq и общий tx', () => {
  const r = applyPatch([], { ...EMPTY_PATCH, add: [
    { type: 'circle_opened', phase: day1, first: 5 }, { type: 'speech_started', phase: day1, kind: 'speech', seat: 5 }] }, 10, ids());
  expect(r.log.map((e) => e.seq)).toEqual([10, 11]); expect(r.nextSeq).toBe(12);
  expect(r.log[0]!.tx).toBe(r.log[1]!.tx); expect(r.undo.added).toEqual(['e1', 'e2']);
});
test('отмена возвращает журнал в точности, включая правку и удаление', () => {
  const a = applyPatch([], { ...EMPTY_PATCH, add: [
    { type: 'nominated', phase: day1, by: 5, target: 7, order: 1 }, { type: 'nominated', phase: day1, by: 6, target: 3, order: 2 }] }, 1, ids());
  const edited = { ...a.log[0]!, target: 9 } as GameEvent;
  const b = applyPatch(a.log, { add: [], replace: [edited], remove: [a.log[1]!.id] }, a.nextSeq, ids());
  expect(b.log).toHaveLength(1); expect(b.log[0]).toMatchObject({ target: 9, seq: 1, edited: true });
  expect(applyUndo(b.log, b.undo)).toEqual(a.log);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/log.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализуй `log.ts` и типы событий.**

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/log.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): журнал событий, пачки и отмена"
```

---

### Task 5: Сессия, команды, игроки и фазы

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/roles/rules.ts`, `tests/helpers.ts`
- Create: `src/engine/commands.ts`, `src/engine/derive.ts`, `src/engine/index.ts`
- Test: `tests/engine/core.test.ts`

**Interfaces:**
- Consumes: `applyPatch`, `nextPhase`, `phaseOrder`, `Registry`.
- Produces:

```ts
export type Durations = { speech: number; balagan: number; defense: number; tiebreak: number; farewell: number };
export const DEFAULT_DURATIONS: Durations;           // 60, 60, 30, 30, 30
export type Rules = { nominationsFromDay: number; balaganFromDay: number };
export const DEFAULT_RULES: Rules;                   // 2, 2
export type SessionConfig = { playerCount: number; composition: Record<RoleId, number>; durations: Durations; rules: Rules; separateTimerStart: boolean };
export type Session = { schemaVersion: 1; id: string; createdAt: number; updatedAt: number; config: SessionConfig;
  log: GameEvent[]; nextSeq: number; undo: UndoEntry[]; timer: TimerState | null; paused: boolean };  // типы TimerKind и TimerState из задачи 9 объяви в types.ts уже здесь

export type Command =
  | { type: 'deal'; assignment: RoleId[] }
  | { type: 'swapRoles'; a: Seat; b: Seat }
  | { type: 'startPhase'; phase: PhaseRef }
  | { type: 'enterStep'; step: StepId }
  | { type: 'setStatus'; seat: Seat; status: 'alive' | 'out'; cause?: OutCause; phase?: PhaseRef }
  | { type: 'finishGame'; winner: SideId | null }
  | { type: 'resumeGame' }
  | { type: 'removeEvent'; id: string };             // остальные варианты добавляют задачи 6–8
export type RejectCode = 'redeal_closed' | 'wrong_phase' | 'not_alive' | 'unknown_event' | 'nominations_closed'
  | 'already_nominated' | 'votes_exceed' | 'step_grey' | 'repeat_target';
export type StateWarning = { code: 'night_outcome_changed'; night: number; expected: Seat | null } | { code: 'votes_overflow'; ballot: 1 | 2 };
export type CommandResult = { ok: true; patch: LogPatch } | { ok: false; reason: RejectCode };
export function execute(session: Session, cmd: Command, registry: Registry): CommandResult;

export type PlayerView = { seat: Seat; roleId: RoleId; side: SideId; status: 'alive' | 'out'; cause?: OutCause; outPhase?: PhaseRef };
export type GameState = { phase: PhaseRef | null; step: StepId | null; players: PlayerView[];
  counts: { total: number; alive: number; bySide: Record<SideId, number> };
  endHint: 'no_black' | 'black_not_less' | null;
  finished: { winner: SideId | null } | null; warnings: StateWarning[] };   // поля day, night, permanentMarks добавляют задачи 6 и 7
export function deriveState(session: Session, registry: Registry): GameState;
export function playersAt(session: Session, registry: Registry, phase: PhaseRef): PlayerView[];   // статусы на начало фазы

// tests/helpers.ts
export const TABLE_11 = 'S c G D c c c M c P c';      // S шериф, G крёстный отец, D доктор, M мафия, P проститутка, c мирный
export function game(table: string, config?: Partial<SessionConfig>): Session;   // сессия с раздачей по строке, фаза deal
export function play(s: Session, ...cmds: Command[]): Session;   // execute + applyPatch + запись undo; бросает при ok: false
export function attempt(s: Session, cmd: Command): CommandResult;
export function st(s: Session): GameState;
export function toDay(s: Session, n: number): Session;           // до начала Дня n: дни без действий, ночи с confirmNight(null) (после задачи 7)
```

Правила:
- События сортируются для вывода по фазе (`phaseOrder`), внутри фазы по `seq`. Текущая фаза — фаза события `phase_started` с наибольшим `seq`; до него — `deal`.
- Шаг по умолчанию при входе в фазу: день с номером меньше `balaganFromDay` — `speeches`, иначе `balagan`; ночь — id первого шага; `deal` — `null`.
- `deal` после начала Дня 1 отклоняется с `redeal_closed`; до него заменяет событие `roles_dealt`.
- `startPhase` принимает только `nextPhase(текущая)`, иначе `wrong_phase`.
- `swapRoles` действует на всю партию задним числом, событие пишется в текущую фазу с `manual: true`.
- `setStatus` без `phase` пишет в текущую фазу с `manual: true`. Последнее по порядку событие статуса для места побеждает.
- `finishGame` при уже завершённой игре заменяет победителя в событии `game_finished`. `resumeGame` удаляет это событие.
- `endHint` считает `roles/rules.ts`: чёрных в игре 0 → `no_black`; чёрных не меньше остальных → `black_not_less`.

- [ ] **Step 1: Write the failing test**

```ts
test('после раздачи: фаза deal, роли и стороны по местам', () => {
  const g = st(game(TABLE_11));
  expect(g.phase).toEqual({ kind: 'deal' }); expect(g.step).toBeNull();
  expect(g.players[2]).toMatchObject({ seat: 3, roleId: 'godfather', side: 'black', status: 'alive' });
  expect(g.counts).toEqual({ total: 11, alive: 11, bySide: { black: 3, red: 8 } });
});
test('перераздать можно только до Дня 1', () => {
  const s = game(TABLE_11); const again = [...st(s).players.map((p) => p.roleId)].reverse();
  expect(st(play(s, { type: 'deal', assignment: again })).players[0]!.roleId).toBe('civilian');
  const d1 = play(s, { type: 'startPhase', phase: { kind: 'day', n: 1 } });
  expect(attempt(d1, { type: 'deal', assignment: again })).toEqual({ ok: false, reason: 'redeal_closed' });
});
test('фазы идут только вперёд по одной, шаг по умолчанию зависит от дня', () => {
  const s = game(TABLE_11);
  expect(attempt(s, { type: 'startPhase', phase: { kind: 'night', n: 1 } })).toEqual({ ok: false, reason: 'wrong_phase' });
  const d1 = play(s, { type: 'startPhase', phase: { kind: 'day', n: 1 } });
  expect(st(d1).step).toBe('speeches');
  expect(st(toDay(s, 2)).step).toBe('balagan');
});
test('ручной статус и возврат в игру', () => {
  const d1 = play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } });
  const out = play(d1, { type: 'setStatus', seat: 9, status: 'out', cause: 'shot' });
  expect(st(out).players[8]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'day', n: 1 } });
  expect(st(out).counts).toMatchObject({ alive: 10, bySide: { black: 3, red: 7 } });
  expect(st(play(out, { type: 'setStatus', seat: 9, status: 'alive' })).counts.alive).toBe(11);
});
test('обмен ролями действует задним числом', () => {
  const g = st(play(toDay(game(TABLE_11), 2), { type: 'swapRoles', a: 1, b: 2 }));
  expect(g.players[0]!.roleId).toBe('civilian'); expect(g.players[1]!.roleId).toBe('sheriff');
});
test('подсказка о конце игры', () => {
  let s = play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } });
  for (const seat of [3, 8, 10]) s = play(s, { type: 'setStatus', seat, status: 'out', cause: 'voted' });
  expect(st(s).endHint).toBe('no_black');
  expect(st(game('G M c c')).endHint).toBe('black_not_less');
  expect(st(game(TABLE_11)).endHint).toBeNull();
});
test('остановка и возобновление', () => {
  const f = play(game(TABLE_11), { type: 'finishGame', winner: 'black' });
  expect(st(f).finished).toEqual({ winner: 'black' });
  expect(st(play(f, { type: 'resumeGame' })).finished).toBeNull();
});
test('playersAt возвращает статусы на начало фазы', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'setStatus', seat: 9, status: 'out', cause: 'shot' });
  expect(playersAt(s, DEFAULT_REGISTRY, { kind: 'day', n: 2 })[8]!.status).toBe('alive');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/core.test.ts`
Expected: FAIL

- [ ] **Step 3: Реализуй `commands.ts`, `derive.ts`, помощники в `tests/helpers.ts`.** До задачи 7 `toDay` проходит ночи одной командой `startPhase`; в задаче 7 замени её на `confirmNight`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/core.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): сессия, команды, вывод состояния игроков и фаз"
```

---

### Task 6: День — круг речей, выставление, голосование

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/commands.ts`, `src/engine/derive.ts`
- Create: `src/engine/day.ts`, `src/engine/vote.ts`
- Test: `tests/engine/day.test.ts`, `tests/engine/vote.test.ts`

**Interfaces:**
- Consumes: `GameState`, `execute`, `play`, `toDay`.
- Produces:

```ts
// добавляется в Command
  | { type: 'openCircle'; first: Seat }
  | { type: 'startSpeech'; kind: SpeechKind; seat: Seat | null }   // завершает идущую речь и начинает новую
  | { type: 'endSpeech' }
  | { type: 'skipSpeaker'; seat: Seat }
  | { type: 'nominate'; by: Seat | null; target: Seat; phase?: PhaseRef }
  | { type: 'removeNomination'; target: Seat; phase?: PhaseRef }
  | { type: 'moveNomination'; target: Seat; toIndex: number }
  | { type: 'setVotes'; ballot: 1 | 2; candidate: Seat; count: number; phase?: PhaseRef }
  | { type: 'setVoters'; ballot: 1 | 2; count: number }
  | { type: 'resetVotes'; ballot: 1 | 2 }
  | { type: 'resolveVote'; ballot: 1 | 2; outcome: 'eliminated' | 'tie' | 'nobody'; seats: Seat[] }

export function circleOrder(first: Seat, alive: Seat[], playerCount: number): Seat[];
export type Nomination = { target: Seat; by: Seat | null; order: number; eventId: string; active: boolean };  // active false — кандидат выбыл
export type SpeechQueue = { done: Seat[]; waiting: Seat[] };
export type VoteHint = { outcome: 'eliminated' | 'tie'; seats: Seat[] } | null;
export type Ballot = { n: 1 | 2; candidates: Seat[]; voters: number; votersOverridden: boolean;
  entries: { candidate: Seat; count: number | null; auto: boolean }[];
  remaining: number; complete: boolean; overflow: boolean; hint: VoteHint;
  resolved: { outcome: 'eliminated' | 'tie' | 'nobody'; seats: Seat[] } | null };
export function maxVotesFor(ballot: Ballot, candidate: Seat): number;
export type DayState = { n: number; nominationsOpen: boolean; opener: Seat | null; previousOpener: Seat | null;
  spoken: Seat[]; skipped: Seat[]; waiting: Seat[];
  speaking: { kind: SpeechKind; seat: Seat | null; eventId: string } | null;
  nominations: Nomination[]; ballots: Ballot[];
  defense: SpeechQueue; tiebreak: SpeechQueue; farewell: SpeechQueue };
// добавляется в GameState
  day: DayState | null;
```

Правила круга:
- `waiting` — игроки в игре, которые не говорили, не пропущены и не говорят сейчас. Порядок: сначала места дальше по кругу от последнего говорившего, затем те, чьё место уже прошли. Так возвращённый в игру встаёт в конец.
- Если говорящий выбыл, `speaking` становится `null`. Речь вида `farewell` статусом выбывшего не прерывается.
- `nominate`: день младше `nominationsFromDay` → `nominations_closed`; цель выбыла → `not_alive`; цель уже в списке → `already_nominated`; новое выставление того же автора заменяет прежнее; `order` новой записи — максимум плюс один. `moveNomination` меняет `order` так, чтобы запись встала на `toIndex`.
- `defense.waiting` — активные кандидаты в порядке выставления, ещё не оправдывавшиеся. `tiebreak` — участники ничьей первого тура, `farewell` — выгнанные; оба в порядке выставления.

Правила голосования:
- Тур 1: кандидаты — активные выставленные в порядке выставления; голосуют все игроки в игре. Тур 2 появляется после `resolveVote` с `tie`: кандидаты — участники ничьей, голосующих на число кандидатов меньше. `setVoters` переопределяет число голосующих.
- `setVotes` отклоняется с `votes_exceed`, если `count` больше `maxVotesFor`.
- Последнему кандидату без явного значения подставляется остаток (`auto: true`), когда у всех предыдущих числа уже есть. Если остаток стал 0 раньше, всем кандидатам без числа подставляется 0. Тур `complete`, когда у каждого кандидата есть число.
- `hint`: единственный максимум → `eliminated`; максимум у двоих и больше → `tie`. При одном кандидате тур сразу `complete` с `hint` `eliminated`. Без кандидатов `ballots` пуст.
- `resolveVote` с `eliminated` ставит каждому из `seats` статус `out` с причиной `voted` и источником `vote` в той же пачке.
- `overflow` истинно, когда явно введённых голосов больше, чем голосующих; тогда в `GameState.warnings` есть `votes_overflow`.

- [ ] **Step 1: Write the failing test (круг и выставление)**

```ts
const d2 = () => toDay(game(TABLE_11), 2);
const speak = (seat: number): Command => ({ type: 'startSpeech', kind: 'speech', seat });
test('пример из ТЗ: 11 игроков, начинает №5', () => {
  expect(circleOrder(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 11)).toEqual([5, 6, 7, 8, 9, 10, 11, 1, 2, 3, 4]);
  expect(circleOrder(5, [1, 2, 5, 7, 11], 11)).toEqual([5, 7, 11, 1, 2]);
});
test('очередь речей', () => {
  const s = play(d2(), { type: 'openCircle', first: 5 }, speak(5), speak(6));
  expect(st(s).day).toMatchObject({ opener: 5, spoken: [5], waiting: [7, 8, 9, 10, 11, 1, 2, 3, 4] });
  expect(st(s).day!.speaking).toMatchObject({ kind: 'speech', seat: 6 });
});
test('говорящий выбыл; возвращённый встаёт в конец; пропуск', () => {
  let s = play(d2(), { type: 'openCircle', first: 5 }, speak(5), { type: 'setStatus', seat: 6, status: 'out', cause: 'voted' }, speak(7));
  s = play(s, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' });
  expect(st(s).day!.speaking).toBeNull();
  s = play(s, speak(8), { type: 'setStatus', seat: 6, status: 'alive' }, { type: 'skipSpeaker', seat: 9 });
  expect(st(s).day!.waiting).toEqual([10, 11, 1, 2, 3, 4, 6]);
});
test('выставление', () => {
  const d1 = play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } });
  expect(attempt(d1, { type: 'nominate', by: 5, target: 7 })).toEqual({ ok: false, reason: 'nominations_closed' });
  let s = play(d2(), { type: 'nominate', by: 5, target: 7 }, { type: 'nominate', by: 6, target: 3 }, { type: 'nominate', by: 2, target: 2 });
  expect(attempt(s, { type: 'nominate', by: 8, target: 3 })).toEqual({ ok: false, reason: 'already_nominated' });
  s = play(s, { type: 'nominate', by: 6, target: 10 }, { type: 'nominate', by: null, target: 4 });
  expect(st(s).day!.nominations.map((n) => [n.target, n.by])).toEqual([[7, 5], [2, 2], [10, 6], [4, null]]);
  s = play(s, { type: 'moveNomination', target: 4, toIndex: 0 }, { type: 'setStatus', seat: 10, status: 'out', cause: 'shot' });
  expect(st(s).day!.nominations.map((n) => [n.target, n.active])).toEqual([[4, true], [7, true], [2, true], [10, false]]);
  expect(st(s).day!.defense.waiting).toEqual([4, 7, 2]);
  expect(attempt(s, { type: 'nominate', by: 1, target: 10 })).toEqual({ ok: false, reason: 'not_alive' });
});
test('вчерашний начинающий', () => {
  const s = toDay(play(play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } }), { type: 'openCircle', first: 3 }), 2);
  expect(st(s).day!.previousOpener).toBe(3);
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/engine/day.test.ts`

- [ ] **Step 3: Реализуй `day.ts` и команды круга и выставления.**

- [ ] **Step 4: Run, verify PASS.** Run: `npx vitest run tests/engine/day.test.ts`

- [ ] **Step 5: Write the failing test (голосование)**

```ts
const nominated = (s: Session, ...targets: number[]) => targets.reduce((acc, t, i) => play(acc, { type: 'nominate', by: i + 1, target: t }), s);
const votes = (s: Session, ballot: 1 | 2, pairs: [number, number][]) => pairs.reduce((acc, [c, n]) => play(acc, { type: 'setVotes', ballot, candidate: c, count: n }), s);
const b = (s: Session, i = 0) => st(s).day!.ballots[i]!;
test('пример из ТЗ: остаток уходит последнему', () => {
  const s = votes(nominated(d2(), 7, 3, 10, 11, 4), 1, [[7, 0], [3, 2], [10, 3], [11, 2]]);
  expect(b(s).entries.at(-1)).toEqual({ candidate: 4, count: 4, auto: true });
  expect(b(s)).toMatchObject({ voters: 11, remaining: 0, complete: true, hint: { outcome: 'eliminated', seats: [4] } });
});
test('превысить число голосующих нельзя', () => {
  const s = votes(nominated(d2(), 7, 3, 10, 11, 4), 1, [[7, 0], [3, 2], [10, 3]]);
  expect(maxVotesFor(b(s), 11)).toBe(6);
  expect(attempt(s, { type: 'setVotes', ballot: 1, candidate: 11, count: 7 })).toEqual({ ok: false, reason: 'votes_exceed' });
  expect(maxVotesFor(b(s), 3)).toBe(8);
});
test('голоса кончились раньше — остальным ноль', () => {
  const s = votes(nominated(d2(), 7, 3, 10), 1, [[7, 11]]);
  expect(b(s).entries.map((e) => e.count)).toEqual([11, 0, 0]); expect(b(s).hint).toEqual({ outcome: 'eliminated', seats: [7] });
});
test('ничья, переголосование без голосов ничейных, вторая ничья', () => {
  let s = play(nominated(d2(), 7, 3, 10, 11, 4), { type: 'setStatus', seat: 9, status: 'out', cause: 'shot' });
  s = votes(s, 1, [[7, 0], [3, 2], [10, 3], [11, 2]]);
  expect(b(s)).toMatchObject({ voters: 10, hint: { outcome: 'tie', seats: [10, 4] } });
  s = play(s, { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [10, 4] });
  expect(st(s).day!.tiebreak.waiting).toEqual([10, 4]);
  expect(b(s, 1)).toMatchObject({ n: 2, candidates: [10, 4], voters: 8 });
  s = votes(s, 2, [[10, 4]]);
  expect(b(s, 1)).toMatchObject({ complete: true, hint: { outcome: 'tie', seats: [10, 4] } });
  s = play(s, { type: 'resolveVote', ballot: 2, outcome: 'eliminated', seats: [10, 4] });
  expect(st(s).players[9]).toMatchObject({ status: 'out', cause: 'voted', outPhase: { kind: 'day', n: 2 } });
  expect(st(s).day!.farewell.waiting).toEqual([10, 4]);
});
test('ничья троих идёт по той же схеме; голосовать некому', () => {
  const three = votes(nominated(toDay(game('G c c c c c'), 2), 2, 3, 4), 1, [[2, 2], [3, 2]]);
  expect(b(three).hint).toEqual({ outcome: 'tie', seats: [2, 3, 4] });
  const none = play(votes(nominated(toDay(game('G c c c'), 2), 2, 3), 1, [[2, 2]]), { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [2, 3] });
  expect(b(play(none, { type: 'setVoters', ballot: 2, count: 0 }), 1)).toMatchObject({ voters: 0, complete: true, hint: { outcome: 'tie', seats: [2, 3] } });
});
test('один кандидат и ноль кандидатов', () => {
  expect(b(nominated(d2(), 9))).toMatchObject({ complete: true, hint: { outcome: 'eliminated', seats: [9] } });
  expect(st(d2()).day!.ballots).toEqual([]);
});
test('остаток можно уменьшить, число голосующих — поправить, голоса — сбросить', () => {
  let s = votes(nominated(d2(), 7, 3), 1, [[7, 4], [3, 5]]);
  expect(b(s)).toMatchObject({ remaining: 2, complete: true }); expect(b(s).entries[1]).toMatchObject({ count: 5, auto: false });
  s = play(s, { type: 'setVoters', ballot: 1, count: 9 });
  expect(b(s)).toMatchObject({ voters: 9, votersOverridden: true, remaining: 0 });
  expect(b(play(s, { type: 'resetVotes', ballot: 1 })).entries.map((e) => e.count)).toEqual([null, null]);
});
test('статус меняется посреди голосования: пересчёт без падения', () => {
  let s = votes(nominated(d2(), 7, 3, 10), 1, [[7, 6], [3, 5]]);
  s = play(s, { type: 'setStatus', seat: 1, status: 'out', cause: 'shot' });
  expect(b(s)).toMatchObject({ voters: 10, overflow: true });
  expect(st(s).warnings).toContainEqual({ code: 'votes_overflow', ballot: 1 });
  s = play(s, { type: 'setStatus', seat: 3, status: 'out', cause: 'shot' });
  expect(b(s).candidates).toEqual([7, 10]);
});
```

- [ ] **Step 6: Run, verify FAIL.** Run: `npx vitest run tests/engine/vote.test.ts`

- [ ] **Step 7: Реализуй `vote.ts` и команды голосования.**

- [ ] **Step 8: Run, verify PASS.** Run: `npx vitest run tests/engine`

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(engine): круг речей, выставление и голосование"
```

---

### Task 7: Ночь

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/commands.ts`, `src/engine/derive.ts`, `tests/helpers.ts`
- Create: `src/engine/night.ts`
- Test: `tests/engine/night.test.ts`

**Interfaces:**
- Consumes: `Registry.nightActions`, `playersAt`.
- Produces:

```ts
// добавляется в Command
  | { type: 'recordNightAction'; actionId: string; actor: Seat | null; target: Seat | null; phase?: PhaseRef; force?: true }
  | { type: 'confirmNight'; chosen: Seat | null }
  | { type: 'acknowledgeNight'; night: number; apply: boolean }     // поведение — задача 8

export type CheckAnswer = { kind: 'side'; side: SideId } | { kind: 'found'; found: boolean } | { kind: 'blocked' };
export type NightStep = { id: string;               // actionId для командного и серого шага, иначе `${actionId}:${actor}`
  actionId: string; effect: EffectId; actor: Seat | null; actors: Seat[];
  performerRole: RoleId;                            // роль, которая выполняет шаг этой ночью
  inherited: boolean; grey: boolean;
  recorded: boolean; target: Seat | null; answer?: CheckAnswer;
  lastNight: { recorded: boolean; target: Seat | null; answer?: CheckAnswer } };
export type NightOutcome = { shotAt: Seat | null; dies: Seat | null;
  reason: 'shot' | 'healed' | 'no_shot' | 'shooter_blocked'; blocked: Seat[]; healed: Seat[] };
export type NightState = { n: number; steps: NightStep[]; outcome: NightOutcome; complete: boolean;
  confirmed: { hinted: Seat | null; chosen: Seat | null } | null };
export function nightState(session: Session, registry: Registry, n: number): NightState;   // и для прошлых ночей
// добавляется в GameState
  night: NightState | null;
  permanentMarks: { seat: Seat; actionId: string }[];   // кого проверяли действия check_side и find_role за всю игру
```

Правила (раздел 5.4–5.5 спецификации):
- Шаги строятся из `nightActions` по `order`. Носители действия — игроки с ролью из `performers`, которые были в игре на начало ночи. Действия нет среди шагов, если ни одной роли из `performers` и `inheritedBy` нет в раздаче.
- `scope: 'team'` — один шаг на всех носителей. `scope: 'each'` — по шагу на каждого носителя в игре.
- Носителей в игре нет: если есть игроки с ролью `inheritedBy`, шаг выполняют они (`inherited: true`, `performerRole` — их роль); иначе шаг один, серый, и `recordNightAction` на нём отклоняется с `step_grey`.
- Цель должна быть в игре на начало ночи, иначе `not_alive`. `target: null` — «Никого».
- `noRepeatTarget`: цель совпала с записанной целью этого же носителя прошлой ночью → отклонение `repeat_target`; с `force: true` запись проходит и засчитывается.
- Повторная запись того же шага заменяет событие.
- Все действия ночи одновременны. Заблокированные — цели всех действий `block`.
- Выстрел не срабатывает (`shooter_blocked`), если: носитель роли `leader` в игре и заблокирован; либо лидера в игре нет, стреляющий в игре ровно один и он заблокирован. Блок не-лидера при живом лидере выстрел не отменяет.
- Лечение носителя не действует, если этот носитель заблокирован.
- `dies` — цель выстрела, если выстрел состоялся и цель не вылечена.
- Ответ `check_side`: `blocked`, если проверяющий заблокирован, иначе `seenBySheriffAs` роли цели. Ответ `find_role`: совпала ли роль цели с `findRole`; блок на него не влияет.
- `complete` — у каждого несерого шага есть запись.
- `confirmNight` в одной пачке пишет `status_set` для `chosen` (причина `shot`, источник `night`, фаза — эта ночь), `night_confirmed` с `hinted: outcome.dies` и `phase_started` следующего дня.

- [ ] **Step 1: Write the failing test (шаги и итог)**

```ts
const act = (actionId: string, actor: number | null, target: number | null): Command => ({ type: 'recordNightAction', actionId, actor, target });
const n1 = (table = TABLE_11) => play(toDay(game(table), 1), { type: 'startPhase', phase: { kind: 'night', n: 1 } });
const out = (s: Session) => st(s).night!.outcome;
test('шаги ночи из справочника', () => {
  expect(st(n1()).night!.steps.map((x) => x.id)).toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4']);
  expect(st(n1()).night!.steps[0]).toMatchObject({ actors: [3, 8], grey: false, recorded: false });
  expect(st(n1('S c G D c c c M c c c')).night!.steps.map((x) => x.actionId)).not.toContain('prostitute_block');
  expect(st(n1('S D G M c c c c D')).night!.steps.map((x) => x.id)).toContain('doctor_heal:9');
});
test('выстрел, лечение, пропуск', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7)))).toMatchObject({ dies: 7, reason: 'shot' });
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7)))).toMatchObject({ dies: null, reason: 'healed', healed: [7] });
  expect(out(play(n1(), act('mafia_shot', null, null)))).toMatchObject({ dies: null, reason: 'no_shot' });
  expect(out(play(n1(), act('mafia_shot', null, 8)))).toMatchObject({ dies: 8 });
  expect(out(play(n1(), act('mafia_shot', null, 4), act('doctor_heal', 4, 4)))).toMatchObject({ dies: null, reason: 'healed' });
});
test('блок', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7), act('prostitute_block', 10, 3)))).toMatchObject({ dies: null, reason: 'shooter_blocked' });
  expect(out(play(n1(), act('mafia_shot', null, 7), act('prostitute_block', 10, 8)))).toMatchObject({ dies: 7 });
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7), act('prostitute_block', 10, 4)))).toMatchObject({ dies: 7, blocked: [4] });
});
test('крёстный отец выбыл: стреляют оставшиеся, шерифа никто не ищет', () => {
  const t = 'S c G D c c M M c P c';
  let s = play(toDay(game(t), 1), { type: 'setStatus', seat: 3, status: 'out', cause: 'voted' }, { type: 'startPhase', phase: { kind: 'night', n: 1 } });
  expect(st(s).night!.steps.find((x) => x.actionId === 'godfather_search')).toMatchObject({ id: 'godfather_search', grey: true });
  expect(attempt(s, act('godfather_search', null, 1))).toEqual({ ok: false, reason: 'step_grey' });
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 7)))).toMatchObject({ dies: 5 });
  s = play(toDay(game(t), 1), { type: 'setStatus', seat: 3, status: 'out', cause: 'voted' }, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' },
    { type: 'startPhase', phase: { kind: 'night', n: 1 } });
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 8)))).toMatchObject({ reason: 'shooter_blocked' });
});
test('все мафии выбыли: стреляет проститутка', () => {
  let s = toDay(game(TABLE_11), 1);
  for (const seat of [3, 8]) s = play(s, { type: 'setStatus', seat, status: 'out', cause: 'voted' });
  s = play(s, { type: 'startPhase', phase: { kind: 'night', n: 1 } });
  expect(st(s).night!.steps[0]).toMatchObject({ id: 'mafia_shot', actors: [10], performerRole: 'prostitute', inherited: true, grey: false });
  expect(out(play(s, act('mafia_shot', null, 5)))).toMatchObject({ dies: 5 });
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 10)))).toMatchObject({ reason: 'shooter_blocked' });
});
test('ответы шерифу и крёстному отцу', () => {
  const answer = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!.answer;
  for (const [target, side] of [[8, 'black'], [3, 'black'], [10, 'black'], [2, 'red']] as const)
    expect(answer(play(n1(), act('sheriff_check', 1, target)), 'sheriff_check:1')).toEqual({ kind: 'side', side });
  expect(answer(play(n1(), act('prostitute_block', 10, 1), act('sheriff_check', 1, 8)), 'sheriff_check:1')).toEqual({ kind: 'blocked' });
  expect(answer(play(n1(), act('godfather_search', 3, 1)), 'godfather_search:3')).toEqual({ kind: 'found', found: true });
  expect(answer(play(n1(), act('godfather_search', 3, 5), act('prostitute_block', 10, 3)), 'godfather_search:3')).toEqual({ kind: 'found', found: false });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/engine/night.test.ts`

- [ ] **Step 3: Реализуй `night.ts` и `recordNightAction`.**

- [ ] **Step 4: Run, verify PASS.** Run: `npx vitest run tests/engine/night.test.ts`

- [ ] **Step 5: Write the failing test (повтор цели, подтверждение, расширяемость)**

```ts
test('доктор: повтор цели — предупреждение, через ночь можно', () => {
  let s = play(n1(), act('doctor_heal', 4, 5), { type: 'confirmNight', chosen: null });
  s = play(s, { type: 'startPhase', phase: { kind: 'night', n: 2 } });
  expect(st(s).night!.steps.at(-1)!.lastNight).toMatchObject({ recorded: true, target: 5 });
  expect(attempt(s, act('doctor_heal', 4, 5))).toEqual({ ok: false, reason: 'repeat_target' });
  const forced = play(s, act('mafia_shot', null, 5), { type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 5, force: true });
  expect(out(forced)).toMatchObject({ dies: null, reason: 'healed' });
  s = play(s, act('doctor_heal', 4, 6), { type: 'confirmNight', chosen: null }, { type: 'startPhase', phase: { kind: 'night', n: 3 } });
  expect(attempt(s, act('doctor_heal', 4, 5)).ok).toBe(true);
});
test('цель должна быть в игре; постоянные метки', () => {
  const s = play(toDay(game(TABLE_11), 1), { type: 'setStatus', seat: 9, status: 'out', cause: 'voted' }, { type: 'startPhase', phase: { kind: 'night', n: 1 } });
  expect(attempt(s, act('mafia_shot', null, 9))).toEqual({ ok: false, reason: 'not_alive' });
  const marked = st(play(s, act('sheriff_check', 1, 8), act('godfather_search', 3, 5)));
  expect(marked.permanentMarks).toEqual(expect.arrayContaining([{ seat: 8, actionId: 'sheriff_check' }, { seat: 5, actionId: 'godfather_search' }]));
});
test('подтверждение итога — одна пачка: статус, отметка и новый день', () => {
  const before = play(n1(), act('mafia_shot', null, 7));
  expect(st(before).night!.complete).toBe(false);
  const s = play(before, { type: 'confirmNight', chosen: 7 });
  expect(st(s).phase).toEqual({ kind: 'day', n: 2 });
  expect(st(s).players[6]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } });
  expect(nightState(s, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: 7, chosen: 7 });
  expect(st({ ...s, log: applyUndo(s.log, s.undo.at(-1)!) }).phase).toEqual({ kind: 'night', n: 1 });
  expect(st(play(before, { type: 'confirmNight', chosen: 2 })).players[1]!.status).toBe('out');
});
test('вымышленная роль с существующим эффектом работает без правок движка', () => {
  const reg: Registry = { ...DEFAULT_REGISTRY,
    roles: [...DEFAULT_REGISTRY.roles, { id: 'bodyguard', nameKey: 'role.bodyguard', side: 'red', defaultCount: 0, seenBySheriffAs: 'red' }],
    nightActions: [...DEFAULT_REGISTRY.nightActions, { id: 'bodyguard_guard', order: 45, effect: 'heal', performers: ['bodyguard'], scope: 'each', stepKey: 'k', questionKey: 'q' }] };
  const s = gameWith(reg, ['godfather', 'bodyguard', 'civilian', 'civilian']);       // помощник в tests/helpers.ts
  const night = playWith(reg, s, { type: 'startPhase', phase: { kind: 'day', n: 1 } }, { type: 'startPhase', phase: { kind: 'night', n: 1 } },
    act('mafia_shot', null, 3), act('bodyguard_guard', 2, 3));
  expect(nightState(night, reg, 1).steps.map((x) => x.id)).toEqual(['mafia_shot', 'godfather_search:1', 'bodyguard_guard:2']);
  expect(nightState(night, reg, 1).outcome).toMatchObject({ dies: null, reason: 'healed' });
});
```

- [ ] **Step 6: Run, verify FAIL.** Run: `npx vitest run tests/engine/night.test.ts`

- [ ] **Step 7: Реализуй `confirmNight`, повтор цели, `permanentMarks`; добавь `gameWith`, `playWith` и переведи `toDay` на `confirmNight(null)`.**

- [ ] **Step 8: Run, verify PASS.** Run: `npx vitest run tests/engine`

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(engine): ночь, итог ночи, крёстный отец и наследование выстрела"
```

---

### Task 8: Журнал для показа, правка прошлого, сценарная партия

**Files:**
- Modify: `src/engine/commands.ts`, `src/engine/derive.ts`, `src/engine/index.ts`
- Create: `src/engine/journal.ts`
- Test: `tests/engine/journal.test.ts`, `tests/scenarios/full-game.test.ts`

**Interfaces:**
- Consumes: всё из задач 4–7.
- Produces:

```ts
export type JournalEntry = { eventId: string | null; edited: boolean; manual: boolean } & (
  | { kind: 'deal'; counts: Record<RoleId, number> }
  | { kind: 'night_action'; actionId: string; performerRole: RoleId; actor: Seat | null; target: Seat | null; answer?: CheckAnswer }
  | { kind: 'night_missing'; actionId: string; actor: Seat | null }     // шаг прошлой ночи без записи
  | { kind: 'night_result'; dies: Seat | null; reason: NightOutcome['reason'] }
  | { kind: 'circle'; first: Seat }
  | { kind: 'nomination'; index: number; by: Seat | null; target: Seat }
  | { kind: 'votes'; ballot: 1 | 2; voters: number; entries: { candidate: Seat; count: number }[] }
  | { kind: 'vote_result'; ballot: 1 | 2; outcome: 'eliminated' | 'tie' | 'nobody'; seats: Seat[] }
  | { kind: 'status'; seat: Seat; status: 'alive' | 'out'; cause?: OutCause }
  | { kind: 'swap'; a: Seat; b: Seat }
  | { kind: 'finish'; winner: SideId | null });
export type JournalGroup = { phase: PhaseRef; current: boolean; entries: JournalEntry[] };
export function journal(session: Session, registry: Registry): JournalGroup[];   // от текущей фазы к распределению
```

Правила:
- Служебные события (`phase_started`, `step_entered`, `speech_started`, `speech_ended`, `speaker_skipped`, `night_confirmed`, `voters_set`) в журнал не попадают. Статусы с источником `night` и `vote` показываются записями `night_result` и `vote_result`, а не `status`.
- Записи прошлой ночи идут в порядке шагов; у несерого шага без записи — `night_missing`.
- Команды с полем `phase` пишут в указанную прошлую фазу; цель проверяется по `playersAt` той фазы.
- После правки прошлой ночи: если пересчитанный `outcome.dies` отличается от `confirmed.hinted`, в `GameState.warnings` появляется `{ code: 'night_outcome_changed', night, expected: outcome.dies }`. Статусы сами не меняются.
- `acknowledgeNight` с `apply: true` в одной пачке возвращает в игру прежнего выбывшего этой ночи, ставит `out` новому (фаза — та ночь) и обновляет `night_confirmed`; с `apply: false` только обновляет `hinted`. Предупреждение исчезает в обоих случаях.
- `removeEvent` удаляет событие по id; неизвестный id → `unknown_event`.
- `deriveState` и `journal` не бросают исключений ни на каком журнале: ссылка на отсутствующее событие, место вне диапазона, голос за снятого кандидата пропускаются.

- [ ] **Step 1: Write the failing test**

```ts
test('группы журнала: текущая фаза первой, служебные события скрыты', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'openCircle', first: 5 }, { type: 'startSpeech', kind: 'speech', seat: 5 }, { type: 'nominate', by: 5, target: 7 });
  const groups = journal(s, DEFAULT_REGISTRY);
  expect(groups.map((g) => g.phase.kind)).toEqual(['day', 'night', 'day', 'deal']);
  expect(groups[0]).toMatchObject({ current: true });
  expect(groups[0]!.entries.map((e) => e.kind)).toEqual(['circle', 'nomination']);
  expect(groups.at(-1)!.entries[0]).toMatchObject({ kind: 'deal', counts: { godfather: 1, mafia: 1, civilian: 6 } });
});
test('незаписанный шаг прошлой ночи виден и дописывается задним числом', () => {
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: 7 });
  const night = () => journal(s, DEFAULT_REGISTRY).find((g) => g.phase.kind === 'night')!.entries;
  expect(night().map((e) => e.kind)).toEqual(['night_action', 'night_missing', 'night_missing', 'night_missing', 'night_missing', 'night_result']);
  s = play(s, { type: 'recordNightAction', actionId: 'sheriff_check', actor: 1, target: 8, phase: { kind: 'night', n: 1 } });
  expect(night()[3]).toMatchObject({ kind: 'night_action', actionId: 'sheriff_check', target: 8, answer: { kind: 'side', side: 'black' } });
});
test('правка прошлой ночи не меняет статусы молча', () => {
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: 7 });
  s = play(s, { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 9, phase: { kind: 'night', n: 1 } });
  expect(st(s).players[6]!.status).toBe('out');
  expect(st(s).warnings).toContainEqual({ code: 'night_outcome_changed', night: 1, expected: 9 });
  const applied = st(play(s, { type: 'acknowledgeNight', night: 1, apply: true }));
  expect(applied.players[6]!.status).toBe('alive');
  expect(applied.players[8]).toMatchObject({ status: 'out', outPhase: { kind: 'night', n: 1 } }); expect(applied.warnings).toEqual([]);
  const kept = st(play(s, { type: 'acknowledgeNight', night: 1, apply: false }));
  expect(kept.players[6]!.status).toBe('out'); expect(kept.warnings).toEqual([]);
});
test('ведущий сознательно выбрал другого: предупреждения нет', () => {
  expect(st(play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: null })).warnings).toEqual([]);
});
test('удаление записи', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'nominate', by: 5, target: 7 });
  const id = st(s).day!.nominations[0]!.eventId;
  expect(st(play(s, { type: 'removeEvent', id })).day!.nominations).toEqual([]);
  expect(attempt(s, { type: 'removeEvent', id: 'нет такого' })).toEqual({ ok: false, reason: 'unknown_event' });
});
test('журнал с висячими ссылками не роняет вывод', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'nominate', by: 5, target: 7 }, { type: 'setVotes', ballot: 1, candidate: 7, count: 3 });
  const broken: Session = { ...s, log: [...s.log.filter((e) => e.type !== 'nominated'),
    { id: 'x1', seq: 9001, tx: 'x', phase: { kind: 'day', n: 2 }, type: 'speech_ended', startId: 'нет' },
    { id: 'x2', seq: 9002, tx: 'x', phase: { kind: 'night', n: 1 }, type: 'night_action', actionId: 'нет', actor: 99, target: 42 },
    { id: 'x3', seq: 9003, tx: 'x', phase: { kind: 'day', n: 2 }, type: 'status_set', seat: 99, status: 'out', source: 'manual' }] };
  expect(() => st(broken)).not.toThrow(); expect(() => journal(broken, DEFAULT_REGISTRY)).not.toThrow();
  expect(st(broken).counts.alive).toBe(11);
});
```

`n1` и `act` перенеси из `night.test.ts` в `tests/helpers.ts`.

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/engine/journal.test.ts`

- [ ] **Step 3: Реализуй `journal.ts`, запись в прошлую фазу, `acknowledgeNight`, `removeEvent`, устойчивость вывода.**

- [ ] **Step 4: Run, verify PASS.** Run: `npx vitest run tests/engine`

- [ ] **Step 5: Напиши сценарную партию.** `tests/scenarios/full-game.test.ts` — один тест, который командами движка проходит приёмочный сценарий из раздела 8 спецификации на `TABLE_11` и после каждого шага сценария проверяет состояние:

| Шаг сценария | Что проверить |
|---|---|
| 1 | после `swapRoles` роли поменялись; День 1 начат с №5, `waiting` из 10 мест |
| 2 | Ночь 1: выстрел записан в №6, поиск шерифа в №5 даёт `found: false`, доктор лечит №4; итог подтверждён; правка выстрела на №9 даёт `night_outcome_changed`; после `acknowledgeNight(apply)` выбыл №9, №6 в игре |
| 3 | выставлены 7, 3, 10, 11, 4 в этом порядке; повтор отклонён `already_nominated` |
| 5 | голосуют 10; `votes_exceed` при переборе; голоса 4, 1, 1, 4 и остаток 0 дают ничью №7 и №11; тур 2 на 8 голосов, 4 и 4 — вторая ничья; выгнан один, №11 |
| 6 | Ночь 2: доктор снова лечит №4 — отклонено `repeat_target`; проститутка блокирует №1, проверка шерифа даёт ответ `blocked` |
| 7 | День 3: один кандидат №1 → `hint` `eliminated`; №1 выгнан |
| 8 | Ночь 3: шаг шерифа серый; блок №3 даёт `shooter_blocked`; День 4 без кандидатов → `ballots` пуст |
| 9 | статус «выбыл» и возврат; обмен ролями посреди игры |
| 11 | `finishGame('black')`; в `journal` группы от Дня 4 до распределения |

Шаги 4 и 10 сценария относятся к приложению и проверяются в задачах 10–12.

- [ ] **Step 6: Run the whole suite.** Run: `npm run check`. Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(engine): журнал для показа, правка прошлых записей, сценарная партия"
```

---

### Task 9: Таймер

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/index.ts`
- Create: `src/engine/timer.ts`
- Test: `tests/engine/timer.test.ts`

**Interfaces:**
- Produces:

```ts
export type TimerKind = SpeechKind | 'free';
export type TimerState = { kind: TimerKind; seat: Seat | null; durationMs: number;
  status: 'ready' | 'running' | 'paused'; endsAt: number | null; remainingMs: number };
export type TimerAction = { type: 'start' } | { type: 'pause' } | { type: 'resume' } | { type: 'add'; ms: number } | { type: 'reset' };
export function newTimer(kind: TimerKind, seat: Seat | null, durationMs: number): TimerState;   // status ready
export function timerReduce(state: TimerState, action: TimerAction, now: number): TimerState;
export function timerView(state: TimerState, now: number): { remainingMs: number; overrunMs: number; expired: boolean; lastTen: boolean };
export function crossedZero(state: TimerState, prevNow: number, now: number): boolean;   // момент нуля попал в (prevNow, now]
```

Источник истины — `endsAt` по системным часам. `add` из истёкшего состояния ставит `endsAt = now + ms`. `reset` возвращает `ready` с полной длительностью.

- [ ] **Step 1: Write the failing test**

```ts
const t0 = 1_000_000;
const run = () => timerReduce(newTimer('speech', 6, 60_000), { type: 'start' }, t0);
test('остаток считается от момента окончания', () => {
  expect(timerView(run(), t0 + 18_000)).toEqual({ remainingMs: 42_000, overrunMs: 0, expired: false, lastTen: false });
  expect(timerView(run(), t0 + 52_000).lastTen).toBe(true);
  expect(timerView(run(), t0 + 67_000)).toEqual({ remainingMs: 0, overrunMs: 7_000, expired: true, lastTen: false });
});
test('пауза и продолжение', () => {
  const paused = timerReduce(run(), { type: 'pause' }, t0 + 20_000);
  expect(timerView(paused, t0 + 500_000).remainingMs).toBe(40_000);
  expect(timerView(timerReduce(paused, { type: 'resume' }, t0 + 500_000), t0 + 510_000).remainingMs).toBe(30_000);
});
test('+10 секунд и сброс', () => {
  expect(timerView(timerReduce(run(), { type: 'add', ms: 10_000 }, t0 + 20_000), t0 + 20_000).remainingMs).toBe(50_000);
  expect(timerView(timerReduce(run(), { type: 'add', ms: 10_000 }, t0 + 90_000), t0 + 91_000)).toMatchObject({ remainingMs: 9_000, expired: false });
  expect(timerReduce(run(), { type: 'reset' }, t0 + 30_000)).toMatchObject({ status: 'ready', remainingMs: 60_000, endsAt: null });
});
test('ноутбук уснул на пять минут', () => {
  expect(timerView(run(), t0 + 300_000)).toMatchObject({ expired: true, overrunMs: 240_000 });
});
test('перезагрузка страницы: таймер продолжает идти по часам', () => {
  expect(timerView(JSON.parse(JSON.stringify(run())), t0 + 30_000).remainingMs).toBe(30_000);
});
test('сигнал только в момент пересечения нуля', () => {
  expect(crossedZero(run(), t0 + 59_800, t0 + 60_050)).toBe(true);
  expect(crossedZero(run(), t0 + 60_050, t0 + 60_300)).toBe(false);
  expect(crossedZero(run(), t0 + 300_000, t0 + 300_000)).toBe(false);
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/engine/timer.test.ts`

- [ ] **Step 3: Реализуй `timer.ts`.**

- [ ] **Step 4: Run, verify PASS.** Run: `npx vitest run tests/engine/timer.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): таймер по моменту окончания"
```

---

### Task 10: Хранение и состояние приложения

**Files:**
- Create: `src/platform/storage.ts`, `src/app/store.ts`, `src/app/env.ts`
- Test: `tests/platform/storage.test.ts`, `tests/app/store.test.ts`

**Interfaces:**
- Consumes: весь `src/engine/index.ts`.
- Produces:

```ts
// platform/storage.ts
export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
export type SessionMeta = { id: string; createdAt: number; updatedAt: number; status: 'deal' | 'running' | 'finished';
  playerCount: number; alive: number; phase: PhaseRef; winner: SideId | null };
export type Settings = { lang: 'ru' | 'uk'; sound: boolean; rolesHidden: boolean; lastConfig: SessionConfig | null };
export const DEFAULT_SETTINGS: Settings;               // ru, true, false, null
export type Loaded = { ok: true; session: Session } | { ok: false; raw: string } | null;
export function createStorage(kv: KV): {
  list(): SessionMeta[]; load(id: string): Loaded; save(session: Session, meta: SessionMeta): boolean; remove(id: string): void;
  activeId(): string | null; setActiveId(id: string | null): void; settings(): Settings; saveSettings(s: Settings): boolean };

// app/store.ts
export type Screen = 'home' | 'setup' | 'deal' | 'game' | 'summary';
export type Env = { kv: KV; now: () => number; newId: () => string; randomInt: RandomInt; registry: Registry };
export type AppState = { screen: Screen; session: Session | null; game: GameState | null; settings: Settings;
  draft: SessionConfig; sessions: SessionMeta[]; storageError: boolean; brokenSession: string | null };
export type AppStore = { getState(): AppState; subscribe(fn: () => void): () => void;
  dispatch(cmd: Command): CommandResult; undo(): void; canUndo(): boolean;
  speak(kind: SpeechKind, seat: Seat | null): CommandResult;      // startSpeech + таймер нужной длительности
  timer(action: TimerAction): void; freeTimer(seconds: number): void;
  setPaused(paused: boolean): void; setSettings(patch: Partial<Settings>): void;
  newGame(): void; editDraft(patch: Partial<SessionConfig>): void; dealDraft(): void;
  openSession(id: string): void; deleteSession(id: string): void; goHome(): void; rematch(): void };
export function createAppStore(env: Env): AppStore;
// app/env.ts
export function browserEnv(): Env;                      // localStorage, Date.now, crypto.randomUUID, cryptoRandomInt, DEFAULT_REGISTRY
```

Правила:
- Ключи хранилища: `mafia:index`, `mafia:session:<id>`, `mafia:active`, `mafia:settings`.
- `load` возвращает `{ ok: false, raw }` для нечитаемого JSON и для `schemaVersion`, отличной от 1, и ничего не перезаписывает. `save` и `saveSettings` ловят исключение `setItem` и возвращают `false`.
- Экран выводится из сессии: фаза `deal` → `deal`; есть `finished` → `summary`; иначе `game`.
- При создании store открывает сессию из `mafia:active`. Битая сессия — экран `home` и её id в `brokenSession`.
- `dispatch`: `execute` → `applyPatch` → запись `UndoEntry` в `session.undo` (не больше 50, старые отбрасываются) → `updatedAt` → сохранение. Неудачное сохранение ставит `storageError: true`, состояние в памяти обновляется в любом случае.
- `undo` применяет последнюю запись, сохраняет сессию и переводит таймер в `ready`.
- `speak` ставит `session.timer = newTimer(kind, seat, durations[kind] * 1000)` и сразу запускает его, если `separateTimerStart` ложно. Состояние таймера сохраняется при каждом его изменении.
- `newGame` открывает `setup` с черновиком из `settings.lastConfig`, а при его отсутствии — 10 игроков, `defaultComposition`, `DEFAULT_DURATIONS`, `DEFAULT_RULES`, `separateTimerStart: false`.
- `dealDraft` при ошибках `checkComposition` ничего не делает; иначе создаёт сессию, раздаёт через `dealRoles(deck, env.randomInt)`, запоминает `lastConfig`, ставит `mafia:active`.
- `rematch` открывает `setup` с конфигурацией текущей сессии.

- [ ] **Step 1: Write the failing test**

```ts
// tests/platform/storage.test.ts — fakeKV() из tests/helpers.ts: Map-хранилище с полем failWrites
test('сессия, индекс, активная игра и настройки сохраняются и читаются', () => {
  const kv = fakeKV(); const st1 = createStorage(kv); const s = game(TABLE_11);
  expect(st1.save(s, metaOf(s))).toBe(true); st1.setActiveId(s.id);
  const st2 = createStorage(kv);
  expect(st2.load(s.id)).toEqual({ ok: true, session: s }); expect(st2.list()).toHaveLength(1); expect(st2.activeId()).toBe(s.id);
  expect(st2.settings()).toEqual(DEFAULT_SETTINGS);
});
test('битые данные не затираются', () => {
  const kv = fakeKV(); kv.setItem('mafia:session:a', '{не json'); kv.setItem('mafia:session:b', JSON.stringify({ schemaVersion: 99 }));
  expect(createStorage(kv).load('a')).toEqual({ ok: false, raw: '{не json' });
  expect(createStorage(kv).load('b')).toMatchObject({ ok: false }); expect(kv.getItem('mafia:session:a')).toBe('{не json');
});
test('запись не удалась — false, без исключения', () => {
  const kv = fakeKV(); kv.failWrites = true; expect(createStorage(kv).save(game(TABLE_11), metaOf(game(TABLE_11)))).toBe(false);
});

// tests/app/store.test.ts — testEnv(kv?) из tests/helpers.ts: счётчик id, часы-переменная, randomInt = () => 0
test('новая игра: 10 игроков при первом запуске, раздача создаёт сессию', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame();
  expect(app.getState()).toMatchObject({ screen: 'setup', draft: { playerCount: 10 } });
  app.editDraft({ playerCount: 11, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 } }); app.dealDraft();
  expect(app.getState().screen).toBe('deal'); expect(app.getState().game!.counts).toMatchObject({ total: 11, bySide: { black: 3, red: 8 } });
  expect(env.kv.getItem('mafia:active')).toBe(app.getState().session!.id);
});
test('состав с ошибкой не раздаётся', () => {
  const app = createAppStore(testEnv()); app.newGame(); app.editDraft({ playerCount: 4, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 } });
  app.dealDraft(); expect(app.getState().screen).toBe('setup');
});
test('отмена откатывает переход фазы и переживает перезагрузку', () => {
  const env = testEnv(); const app = seeded(env);            // seeded: newGame + dealDraft на 11 игроков
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); expect(app.getState().screen).toBe('game');
  const reloaded = createAppStore(env);
  expect(reloaded.getState().game!.phase).toEqual({ kind: 'day', n: 1 }); expect(reloaded.canUndo()).toBe(true);
  reloaded.undo(); expect(reloaded.getState().screen).toBe('deal');
});
test('стек отмены не длиннее 50', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } });
  for (let i = 0; i < 60; i++) app.dispatch({ type: 'setStatus', seat: 2, status: i % 2 ? 'alive' : 'out', cause: 'voted' });
  expect(app.getState().session!.undo).toHaveLength(50);
});
test('слово, таймер и отмена', () => {
  const env = testEnv(); const app = seeded(env); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } });
  app.dispatch({ type: 'openCircle', first: 5 }); app.speak('speech', 5);
  expect(app.getState().session!.timer).toMatchObject({ kind: 'speech', seat: 5, status: 'running', durationMs: 60_000 });
  app.undo(); expect(app.getState().session!.timer!.status).toBe('ready'); expect(app.getState().game!.day!.speaking).toBeNull();
});
test('хранилище недоступно: игра идёт в памяти, есть признак ошибки', () => {
  const env = testEnv(); const app = seeded(env); env.kv.failWrites = true;
  expect(app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }).ok).toBe(true);
  expect(app.getState()).toMatchObject({ screen: 'game', storageError: true });
});
test('остановка, итоги, новая игра с тем же составом', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'finishGame', winner: 'black' }); expect(app.getState().screen).toBe('summary');
  app.rematch(); expect(app.getState()).toMatchObject({ screen: 'setup', draft: { playerCount: 11 } });
});
test('битая активная сессия не роняет запуск', () => {
  const env = testEnv(); env.kv.setItem('mafia:active', 'z'); env.kv.setItem('mafia:session:z', '{');
  expect(createAppStore(env).getState()).toMatchObject({ screen: 'home', brokenSession: 'z' });
});
```

`metaOf(session): SessionMeta` экспортируй из `src/app/store.ts`.

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/platform tests/app`

- [ ] **Step 3: Реализуй `storage.ts`, `store.ts`, `env.ts`, помощники `fakeKV`, `testEnv`, `seeded`.**

- [ ] **Step 4: Run, verify PASS.** Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(app): хранение в браузере и состояние приложения с отменой"
```

---

### Task 11: Языки, тексты журнала, экраны подготовки

**Files:**
- Create: `src/app/i18n/index.ts`, `src/app/i18n/ru.ts`, `src/app/i18n/uk.ts`, `src/app/i18n/journalText.ts`, `src/app/StoreContext.tsx`, `src/ui/screens/HomeScreen.tsx`, `src/ui/screens/SetupScreen.tsx`, `src/ui/screens/DealScreen.tsx`, `src/ui/common/Button.tsx`, `src/ui/common/Dialog.tsx`, `src/ui/common/Stepper.tsx`, стили рядом
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Test: `tests/app/i18n.test.ts`, `tests/ui/prepare.test.tsx`, `tests/ui/helpers.tsx`

**Interfaces:**
- Consumes: `AppStore`, `journal`, `checkComposition`.
- Produces:

```ts
export type Dict = typeof ru;                               // uk: Dict
export function translate(lang: 'ru' | 'uk', key: keyof Dict, params?: Record<string, string | number>): string;   // подстановка {n}
export function phaseLabel(lang: 'ru' | 'uk', phase: PhaseRef): string;   // «Распределение», «День 2», «Ночь 1»
export function entryText(lang: 'ru' | 'uk', entry: JournalEntry, registry: Registry): string;
export function summaryText(lang: 'ru' | 'uk', group: JournalGroup, registry: Registry): string;   // строка-резюме свёрнутой группы
export function journalAsText(lang: 'ru' | 'uk', groups: JournalGroup[], registry: Registry): string;   // для «Скопировать журнал»
export const StoreProvider: React.FC<{ store: AppStore; children: React.ReactNode }>;
export function useApp(): AppState;                         // useSyncExternalStore
export function useStore(): AppStore;
export function useT(): (key: keyof Dict, params?: Record<string, string | number>) => string;
// tests/ui/helpers.tsx
export function renderApp(prepare?: (app: AppStore) => void): { app: AppStore; user: UserEvent; env: TestEnv; unmount(): void };
export function seedGame(app: AppStore, table: string, day: number): void;   // кладёт в хранилище этого app сессию toDay(game(table), day) и открывает её
```

`renderApp` создаёт `testEnv()`, store и рисует `App`; `prepare` выполняется до первого рисования. `seedGame` находит окружение своего `app` по реестру, который ведёт `renderApp`.

Ключи словаря — плоские строки с точками: `role.<id>`, `side.<id>`, `mark.head`, `step.<id>`, `action.<actionId>.step`, `action.<actionId>.question`, `phase.day`, `phase.night`, `phase.deal`, остальные по экранам. Русские тексты бери из макетов и раздела 6.7 спецификации. Роль с `displayAs` показывается названием этой роли и пометкой `markKey`.

Экраны — по макетам `Home`, `Setup`, `Deal` и разделу 6.7:
- **Главная**: «Новая игра»; незавершённые игры с «Продолжить» и «Удалить»; завершённые с «Открыть» и «Удалить»; удаление через окно подтверждения; переключатель языка; при `brokenSession` — строка «Не удалось прочитать игру» с кнопкой «Скопировать данные».
- **Состав**: счётчик игроков 4–20; строка на каждую роль справочника без `filler` и без `countsWithin` с выключателем и счётчиком; под строкой роли, внутри которой считается другая роль, подпись вида «из них крёстный отец: 1»; строка остатка мирных; итог по сторонам; колода; таймеры с правкой; «Сбросить к стандарту»; «Раздать роли» неактивна при ошибке и показывает её текст; предупреждения показаны строкой.
- **Распределение**: сетка «номер → роль»; блок «Кто есть кто» по ролям; сверка состава; «Перераздать» через окно подтверждения; «Поменять роли двум номерам»; «Назад к составу»; «Город просыпается: День 1»; «Скрыть роли».

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/i18n.test.ts
test('у словарей одинаковые ключи и нет пустых строк', () => {
  expect(Object.keys(uk).sort()).toEqual(Object.keys(ru).sort());
  for (const d of [ru, uk]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
});
test('названия фаз и подстановка', () => {
  expect(phaseLabel('ru', { kind: 'night', n: 2 })).toBe('Ночь 2'); expect(phaseLabel('uk', { kind: 'night', n: 2 })).toBe('Ніч 2');
  expect(phaseLabel('ru', { kind: 'deal' })).toBe('Распределение');
});
test('у каждой роли, стороны и ночного действия справочника есть тексты', () => {
  for (const r of DEFAULT_REGISTRY.roles) expect(ru).toHaveProperty([r.nameKey]);
  for (const a of DEFAULT_REGISTRY.nightActions) { expect(ru).toHaveProperty([a.stepKey]); expect(ru).toHaveProperty([a.questionKey]); }
});
test('запись журнала переводится на оба языка', () => {
  const e: JournalEntry = { kind: 'night_action', actionId: 'godfather_search', performerRole: 'godfather', actor: 3, target: 1,
    answer: { kind: 'found', found: true }, eventId: 'e', edited: false, manual: false };
  expect(entryText('ru', e, DEFAULT_REGISTRY)).toBe('Крёстный отец → №1 — шериф');
  expect(entryText('uk', e, DEFAULT_REGISTRY)).not.toBe(entryText('ru', e, DEFAULT_REGISTRY));
});

// tests/ui/prepare.test.tsx
test('от главной до Дня 1', async () => {
  const { app, user } = renderApp();
  await user.click(screen.getByRole('button', { name: 'Новая игра' }));
  await user.click(screen.getByRole('button', { name: 'Больше игроков' }));
  await user.click(screen.getByRole('button', { name: 'Мафия: больше' }));
  expect(screen.getByText('из них крёстный отец: 1', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('чёрных 3', { exact: false })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Раздать роли/ }));
  expect(app.getState().screen).toBe('deal'); expect(app.getState().game!.players.filter((p) => p.side === 'black')).toHaveLength(3);
  expect(screen.getAllByText(/глава/).length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: /Город просыпается: День 1/ }));
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 1 });
});
test('ролей больше, чем игроков: раздать нельзя, причина видна', async () => {
  const { user } = renderApp((app) => { app.newGame(); app.editDraft({ playerCount: 4, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 } }); });
  expect(screen.getByRole('button', { name: /Раздать роли/ })).toBeDisabled();
  expect(screen.getByText(/ролей на 1 больше, чем игроков/)).toBeInTheDocument();
});
test('перераздать и удалить игру — только через подтверждение', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.dealDraft(); });
  await user.click(screen.getByRole('button', { name: 'Перераздать' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
  expect(app.getState().session!.log.filter((e) => e.type === 'roles_dealt')).toHaveLength(1);
});
test('язык переключается и запоминается', async () => {
  const { app, user } = renderApp();
  await user.click(screen.getByRole('button', { name: 'Українська' }));
  expect(screen.getByRole('button', { name: 'Нова гра' })).toBeInTheDocument(); expect(app.getState().settings.lang).toBe('uk');
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/app/i18n.test.ts tests/ui/prepare.test.tsx`

- [ ] **Step 3: Реализуй словари, тексты журнала, контекст, три экрана и общие компоненты.** `App` выбирает экран по `AppState.screen`; на экранах `game` и `summary` до задач 12 и 16 рисуй заглушку.

- [ ] **Step 4: Run, verify PASS.** Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): языки, главная, состав, распределение"
```

---

### Task 12: Игровой каркас — шапка, стол, панель игрока, журнал, пауза

**Files:**
- Create: `src/ui/screens/GameScreen.tsx`, `src/ui/game/Header.tsx`, `Table.tsx`, `PlayerCard.tsx`, `PlayerPanel.tsx`, `JournalPanel.tsx`, `PauseCurtain.tsx`, `StepNav.tsx`, `MainButton.tsx`, `src/ui/game/selection.tsx`, стили рядом
- Test: `tests/ui/frame.test.tsx`

**Interfaces:**
- Consumes: `useApp`, `useStore`, `useT`, `journal`, `entryText`, `summaryText`.
- Produces:

```ts
// selection.tsx — режим выбора стола, общий для ночи и выставления
export type Selection = { question: string; allowed: Seat[]; picked: Seat | null; marks: Record<Seat, string>;
  onPick(seat: Seat | null): void; onCancel(): void } | null;
export const SelectionProvider: React.FC<{ children: React.ReactNode }>;
export function useSelection(): { selection: Selection; ask(s: NonNullable<Selection>): void; clear(): void };
// MainButton.tsx — главная кнопка одна на игровой экран, её рисует GameScreen внизу панели шага
export type MainAction = { label: string; onPress(): void; disabled?: boolean } | null;
export function useMainAction(action: MainAction): void;    // панель шага сообщает подпись и действие; цвет кнопки — по фазе
// GameScreen.tsx
export type StepPanel = React.FC;       // панель шага; задачи 13–15 добавляют панели в карту «шаг → компонент»
```

Поведение — по макетам `Main`, `Night`, `Components` и разделам 6.2, 6.3, 6.5 спецификации:
- Три колонки: стол, панель шага, журнал; журнал сворачивается.
- **Шапка**: название фазы и шага, цвет и значок по фазе; «в игре X из Y»; счётчики сторон; строка `endHint`; «Отменить» (неактивна, если `canUndo()` ложно); «Скрыть роли»; «Пауза игры»; звук; меню с пунктами «Остановить игру», «Настройки таймеров», «Свободный таймер 30 с» и «60 с», язык, «На главную». При `storageError` — строка «Сохранение недоступно: игра идёт только в этой вкладке».
- **Стол**: сетка, 4 колонки до 12 игроков и 5 от 13; карточки по порядку номеров.
- **Карточка**: номер; роль с точкой стороны и пометкой; статус выбывшего словами; метки дня (говорит сейчас, говорил, начинал день, выставлен с номером, число голосов); постоянные метки из `permanentMarks`.
- **Скрытие ролей** прячет роли, счётчики сторон, ночные и постоянные метки, журнал.
- **Режим обзора**: клик по карточке открывает панель игрока. **Режим выбора** (`selection` не `null`): над столом вопрос, клик по разрешённой карточке вызывает `onPick`, есть плитка «Никого» и «Отмена»; панель игрока открывается кнопкой «⋯» на карточке, в том числе у выбывших.
- **Панель игрока**: «Застрелен», «Выгнан», «Вернуть в игру» (`setStatus`); «Поменять роль с…» (`swapRoles`); записи журнала с этим номером. Дневные пункты добавляет задача 13.
- **Журнал**: группы по фазам, текущая раскрыта, прошлые свёрнуты в `summaryText`; у исправленных записей метка «испр.», у ручных — «вручную». Клик по записи — задача 16.
- **Пауза игры**: `setPaused(true)` ставит таймер на паузу и закрывает экран шторкой с названием фазы и шага без ролей и журнала; «Продолжить игру» снимает шторку, таймер остаётся на паузе.

- [ ] **Step 1: Write the failing test**

```ts
const day2 = (app: AppStore) => seedGame(app, TABLE_11, 2);
test('шапка и стол', () => {
  renderApp(day2);
  const header = within(screen.getByRole('banner'));
  expect(header.getByText('День 2')).toBeInTheDocument(); expect(header.getByText('11 из 11')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^Игрок №/ })).toHaveLength(11);
  expect(within(screen.getByRole('button', { name: 'Игрок №3' })).getByText(/мафия · глава/)).toBeInTheDocument();
});
test('статус с карточки и отмена', async () => {
  const { app, user } = renderApp(day2);
  await user.click(screen.getByRole('button', { name: 'Игрок №9' }));
  await user.click(screen.getByRole('button', { name: 'Застрелен' }));
  expect(app.getState().game!.players[8]!.status).toBe('out'); expect(screen.getByText('10 из 11')).toBeInTheDocument();
  expect(within(screen.getByRole('button', { name: 'Игрок №9' })).getByText(/застрелен · День 2/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Отменить' }));
  expect(app.getState().game!.players[8]!.status).toBe('alive');
});
test('скрытие ролей прячет роли, счётчики сторон и журнал', async () => {
  const { user } = renderApp(day2);
  await user.click(screen.getByRole('button', { name: 'Скрыть роли' }));
  expect(screen.queryByText(/мафия/)).not.toBeInTheDocument(); expect(screen.queryByText(/чёрных/)).not.toBeInTheDocument();
  expect(screen.getByText(/Журнал скрыт/)).toBeInTheDocument();
});
test('пауза закрывает экран и не запускает таймер при снятии', async () => {
  const { app, user } = renderApp((a) => { day2(a); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5); });
  await user.click(screen.getByRole('button', { name: 'Пауза игры' }));
  expect(screen.queryByRole('button', { name: 'Игрок №3' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Продолжить игру' }));
  expect(app.getState().session!.timer!.status).toBe('paused');
});
test('стол на 20 игроков — пять колонок', () => {
  renderApp((a) => seedGame(a, 'G M P S D c c c c c c c c c c c c c c c', 1));
  expect(screen.getByRole('list', { name: 'Игровой стол' })).toHaveAttribute('data-columns', '5');
});
test('предупреждение о недоступном хранилище', () => {
  const { app, env } = renderApp(day2); (env.kv as ReturnType<typeof fakeKV>).failWrites = true;
  act(() => { app.dispatch({ type: 'setStatus', seat: 2, status: 'out', cause: 'voted' }); });
  expect(screen.getByText(/Сохранение недоступно/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/ui/frame.test.tsx`

- [ ] **Step 3: Реализуй каркас.** Панель шага пока показывает только `StepNav` и название шага.

- [ ] **Step 4: Run, verify PASS.** Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): игровой каркас — шапка, стол, панель игрока, журнал, пауза"
```

---

### Task 13: День — таймер, круг речей, выставление, оправдания, прощание

**Files:**
- Create: `src/ui/game/TimerPanel.tsx`, `SpeechPanel.tsx`, `NominationList.tsx`, `src/ui/game/useNow.ts`, стили рядом
- Modify: `src/ui/screens/GameScreen.tsx`, `src/ui/game/PlayerPanel.tsx`, `src/ui/game/StepNav.tsx`
- Test: `tests/ui/day.test.tsx`

**Interfaces:**
- Consumes: `timerView`, `AppStore.speak`, `AppStore.timer`, `useSelection`, `useMainAction`.
- Produces: `export function useNow(intervalMs?: number): number;` — текущее время, обновляется 4 раза в секунду и сразу на событиях `visibilitychange`, `focus`, `pageshow`; в тестах часы берутся из `env.now`. `SpeechPanel` обслуживает шаги `balagan`, `speeches`, `defense`, `tiebreak`, `farewell`.

Поведение — по макету `Main` и разделам 6.4, 6.7:
- **Таймер**: подпись по виду и номеру («Речь №6», «Балаган», «Оправдание №7», «Речь при ничьей №3», «Прощание №3»); цифры `м:сс`; полоса остатка; одна кнопка «Старт / Пауза / Продолжить»; «+10 с»; «Заново». В последние 10 секунд цифры цвета `--alert`. После нуля — «0:00» и перерасход «+0:07».
- **Полоса шагов дня**: в День 1 только «Круг речей»; со Дня 2 — «Балаган», «Круг речей», «Оправдания», «Голосование»; шаги ничьей и прощания появляются, когда наступают. Клик по шагу — `enterStep`.
- **Главная кнопка по ходу**:

| Состояние | Текст | Действие |
|---|---|---|
| балаган, таймер готов | «Запустить балаган · 60 с» | `speak('balagan', null)` |
| балаган идёт или прошёл | «Выбрать, кто начинает круг» | `enterStep('speeches')` и режим выбора |
| круг, нет начинающего | «Выбрать, кто начинает» | режим выбора → `openCircle` |
| круг, есть ожидающие | «Дать слово №5 · 60 с», далее «Следующий: №6 · 60 с» | `speak('speech', waiting[0])` |
| круг закончен, День 1 | «Город засыпает: Ночь 1» | `startPhase` |
| круг закончен, есть кандидаты | «К оправданиям (выставлено 5)» | `enterStep('defense')` |
| круг закончен, кандидатов нет | «Никто не выставлен → Ночь 2» | `startPhase` |
| оправдания | «Оправдание №7 · 30 с», «Следующий: №3 · 30 с» | `speak('defense', …)` |
| оправдания закончены, кандидатов больше одного | «К голосованию» | `enterStep('vote')` |
| оправдания закончены, кандидат один | «№9 выгнан → прощание · 30 с» | `resolveVote(1, 'eliminated', [9])`, `enterStep('farewell')` |
| ничья, речи | «Речь №10 · 30 с», затем «К переголосованию» | `speak('tiebreak', …)`, `enterStep('revote')` |
| прощание | «Прощание №3 · 30 с», затем «Город засыпает: Ночь 2» | `speak('farewell', …)`, `startPhase` |

- Если `separateTimerStart` включено, кнопки передачи слова не запускают таймер, и запуск делается кнопкой «Старт».
- При одном кандидате рядом с главной кнопкой есть вторичная «Никто не выгнан → Ночь N».
- Если в круге остались ожидающие, а ведущий переходит дальше через полосу шагов, над главной кнопкой видна строка «Не говорили: 7, 8».
- **Круг, со Дня 2**: кнопка «№6 выставляет…» включает режим выбора по игрокам в игре, уже выставленные помечены; отказ движка `already_nominated` показывается строкой «№3 уже выставлен». Лента выставленных с автором, кнопки «снять», «выше», «ниже» и «Добавить вручную».
- Строки «Говорили», «Ждут слова», «Вчера начинал №…».
- **Панель игрока, днём**: «Дать слово сейчас» (`speak('speech', seat)`), «Пропустить в круге» (`skipSpeaker`); со Дня 2 — «Выставить» от имени говорящего и «Снять с голосования».
- **Свободный таймер** из меню: `freeTimer(30)` или `freeTimer(60)`.

- [ ] **Step 1: Write the failing test**

```ts
test('День 1: круг с №5 по одной кнопке, без выставления', async () => {
  const { app, user, env } = renderApp((a) => seedGame(a, TABLE_11, 1));
  await user.click(screen.getByRole('button', { name: 'Выбрать, кто начинает' }));
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' })); advance(env, 500);
  await user.click(screen.getByRole('button', { name: /Дать слово №5 · 60 с/ }));
  expect(screen.getByText('Речь №5')).toBeInTheDocument(); expect(screen.getByText('1:00')).toBeInTheDocument();
  advance(env, 18_000); expect(screen.getByText('0:42')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Следующий: №6 · 60 с/ }));
  expect(app.getState().game!.day).toMatchObject({ spoken: [5] }); expect(screen.queryByRole('button', { name: /выставляет/ })).not.toBeInTheDocument();
});
test('ноль не передаёт слово; виден перерасход', async () => {
  const { app, env } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5); });
  advance(env, 67_000);
  expect(screen.getByText('0:00')).toBeInTheDocument(); expect(screen.getByText('+0:07')).toBeInTheDocument();
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 5 });
});
test('пауза, +10 с, заново', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5); });
  advance(env, 40_000); await user.click(screen.getByRole('button', { name: /^Пауза/ })); advance(env, 30_000);
  expect(screen.getByText('0:20')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '+10 с' })); expect(screen.getByText('0:30')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Заново' })); expect(app.getState().session!.timer).toMatchObject({ status: 'ready', remainingMs: 60_000 });
});
test('День 2: выставление в порядке очереди, повтор не добавляется', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'enterStep', step: 'speeches' });
    a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5); });
  await user.click(screen.getByRole('button', { name: '№5 выставляет…' }));
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }));
  await user.click(screen.getByRole('button', { name: /Следующий: №6/ }));
  await user.click(screen.getByRole('button', { name: '№6 выставляет…' }));
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }));
  expect(screen.getByText('№7 уже выставлен')).toBeInTheDocument();
  expect(app.getState().game!.day!.nominations.map((n) => n.target)).toEqual([7]);
  await user.click(screen.getByRole('button', { name: 'Снять №7 с голосования' })); expect(app.getState().game!.day!.nominations).toEqual([]);
});
test('конец круга: никто не выставлен — сразу ночь', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, 'G c c c', 2); a.dispatch({ type: 'enterStep', step: 'speeches' });
    a.dispatch({ type: 'openCircle', first: 1 }); for (const s of [1, 2, 3, 4]) a.speak('speech', s); a.dispatch({ type: 'endSpeech' }); });
  await user.click(screen.getByRole('button', { name: /Никто не выставлен → Ночь 2/ }));
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 2 });
});
test('один кандидат: оправдание, без голосования, прощание', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'nominate', by: 5, target: 9 }); a.dispatch({ type: 'enterStep', step: 'defense' }); });
  await user.click(screen.getByRole('button', { name: /Оправдание №9 · 30 с/ })); advance(env, 500);
  await user.click(screen.getByRole('button', { name: /№9 выгнан → прощание · 30 с/ }));
  expect(app.getState().game!.players[8]).toMatchObject({ status: 'out', cause: 'voted' }); expect(app.getState().game!.step).toBe('farewell');
});
```

`advance(env, ms)` в `tests/ui/helpers.tsx` сдвигает часы `env.now` и прокручивает таймеры Vitest внутри `act`. Между двумя нажатиями главной кнопки тесты сдвигают часы на 500 мс: с задачи 14 кнопка не реагирует 400 мс после смены подписи.

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/ui/day.test.tsx`

- [ ] **Step 3: Реализуй таймер и дневные панели.**

- [ ] **Step 4: Run, verify PASS.** Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): день — таймер, круг речей, выставление, оправдания, прощание"
```

---

### Task 14: Звук, экран не гаснет, горячие клавиши, защита главной кнопки

**Files:**
- Create: `src/platform/sound.ts`, `src/platform/wakeLock.ts`, `src/ui/common/useHotkeys.ts`, `src/ui/game/useTimerSignal.ts`
- Modify: `src/app/store.ts` (поле `Env.beep`), `src/app/env.ts`, `src/ui/game/MainButton.tsx`, `src/ui/screens/GameScreen.tsx`, `tests/helpers.ts`
- Test: `tests/ui/controls.test.tsx`

**Interfaces:**
- Consumes: `crossedZero`, `useNow`, `useMainAction`.
- Produces:

```ts
// platform/sound.ts
export function createBeeper(): () => void;        // один сигнал около секунды через Web Audio; контекст создаётся при первом вызове после жеста
// platform/wakeLock.ts
export function keepAwake(active: boolean): void;  // navigator.wakeLock, перезапрос на visibilitychange; молча ничего не делает, если API нет
// добавляется в Env
  beep: () => void;
// useHotkeys.ts
export function useHotkeys(map: Partial<Record<'space' | 'enter' | 'undo' | 'hide' | 'escape' | `digit${number}`, () => void>>, enabled: boolean): void;
```

Правила:
- Сигнал звучит, когда `crossedZero(timer, предыдущий тик, текущий тик)` истинно и `settings.sound` включён. Визуальный сигнал (мигание панели таймера около трёх секунд) работает всегда.
- Экран удерживается, пока открыт экран `game` и игра не на паузе.
- Клавиши: пробел — старт и пауза таймера; Enter — главная кнопка; Cmd/Ctrl+Z — «Отменить»; H — скрыть и показать роли; Esc — выйти из режима выбора или закрыть панель. Обработчик — один слушатель `keydown` на `document`, который снимается при уходе с игрового экрана.
- Клавиши не действуют, когда открыт `dialog`, игра на паузе или фокус в `input`, `textarea`, `select`. События с `repeat: true` игнорируются.
- Главная кнопка не реагирует на клик и Enter 400 мс после смены своей подписи; время считается по `env.now`. Первое появление кнопки при открытии игрового экрана задержки не даёт.

- [ ] **Step 1: Write the failing test**

```ts
const speaking = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5); };
test('сигнал звучит один раз на нуле и не повторяется', () => {
  const { env } = renderApp(speaking);
  advance(env, 59_000); expect(env.beep).not.toHaveBeenCalled();
  advance(env, 1_500); expect(env.beep).toHaveBeenCalledTimes(1);
  advance(env, 30_000); expect(env.beep).toHaveBeenCalledTimes(1);
});
test('после сна таймер сразу показывает перерасход, сигнал один', () => {
  const { env } = renderApp(speaking);
  sleep(env, 300_000);                                 // сдвигает часы без тиков и шлёт visibilitychange
  expect(screen.getByText('+4:00')).toBeInTheDocument(); expect(env.beep.mock.calls.length).toBeLessThanOrEqual(1);
});
test('звук выключен — сигнала нет', () => {
  const { env } = renderApp((a) => { speaking(a); a.setSettings({ sound: false }); });
  advance(env, 61_000); expect(env.beep).not.toHaveBeenCalled();
});
test('двойное нажатие и автоповтор Enter не проскакивают шаг', async () => {
  const { app, user, env } = renderApp(speaking);
  await user.keyboard('{Enter}'); await user.keyboard('{Enter}');
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 6 });
  advance(env, 500); fireEvent.keyDown(screen.getByRole('main'), { key: 'Enter', repeat: true });
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 6 });
});
test('пробел ставит таймер на паузу; Cmd+Z отменяет; H прячет роли', async () => {
  const { app, user } = renderApp(speaking);
  await user.keyboard(' '); expect(app.getState().session!.timer!.status).toBe('paused');
  await user.keyboard('{Meta>}z{/Meta}'); expect(app.getState().game!.day!.speaking).toBeNull();
  await user.keyboard('h'); expect(app.getState().settings.rolesHidden).toBe(true);
});
test('клавиши не действуют под открытым окном', async () => {
  const { app, user } = renderApp(speaking);
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }));
  await user.keyboard('{Enter}'); await user.keyboard(' ');
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 5 }); expect(app.getState().session!.timer!.status).toBe('running');
});
```

В `testEnv` добавь `beep: vi.fn()`. `sleep` добавь в `tests/ui/helpers.tsx`. Окно остановки в этом тесте может быть пустым `Dialog` — содержимое добавит задача 16.

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/ui/controls.test.tsx`

- [ ] **Step 3: Реализуй звук, удержание экрана, клавиши и защиту кнопки.**

- [ ] **Step 4: Run, verify PASS.** Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): сигнал таймера, горячие клавиши, защита главной кнопки"
```

---

### Task 15: Голосование и ночь

**Files:**
- Create: `src/ui/game/VotePanel.tsx`, `TieDecision.tsx`, `NightPanel.tsx`, `NightSummary.tsx`, стили рядом
- Modify: `src/ui/screens/GameScreen.tsx`, `src/ui/game/StepNav.tsx`, `src/ui/game/PlayerCard.tsx`
- Test: `tests/ui/vote.test.tsx`, `tests/ui/night.test.tsx`

**Interfaces:**
- Consumes: `Ballot`, `maxVotesFor`, `NightState`, `useSelection`, `useMainAction`, `useHotkeys`.
- Produces: панели шагов `vote`, `revote`, ночных шагов и `summary`.

**Голосование** — по макетам `Vote`, `Tie` и разделам 5.8, 6.7:
- Список кандидатов в порядке выставления с введёнными числами; клик по строке делает кандидата текущим.
- «За №11 — сколько голосов?» и кнопки от 0 до `maxVotesFor`; одно нажатие записывает и переходит к следующему без числа. Цифровые клавиши делают то же для значений 0–9.
- «голосуют N · осталось M»; у последнего подпись «все оставшиеся голоса»; кнопка «Голосуют не N…» открывает счётчик (`setVoters`); «Голосовать заново» (`resetVotes`).
- При `overflow` — строка «Введено больше голосов, чем голосующих. Исправь числа».
- Когда тур `complete`, главная кнопка по подсказке: «№3 выгнан → прощание · 30 с» (`resolveVote` и `enterStep('farewell')`) или «Ничья №10 и №4 → речи по 30 с» (`resolveVote` с `tie` и `enterStep('tiebreak')`). Вторичные всегда: «Никто не выгнан → Ночь N», «Выгнать другого…».
- Тур 2 с подсказкой `tie` или без голосующих: три равные кнопки без главной — «Выгнать одного…» (режим выбора по участникам ничьей), «Выгнать всех: №10 и №4», «Никто не выгнан → Ночь N» — и «Переголосовать ещё раз».
- В голосовании на карточке кандидата вместо номера выставления показано число голосов.

**Ночь** — по макетам `Night`, `NightResult` и разделам 5.4, 5.5, 6.7:
- Полоса шагов — вертикальный список: название шага, записанный выбор «→ №6», под ним «прошлой ночью №9». Серый шаг подписан «выбыл · разбудить для вида». Последний пункт — «Итог ночи». Клик по пункту — `enterStep`.
- Текущий шаг: стол в режиме выбора с вопросом действия; строка «Просыпается … — №3» с названием `performerRole`; строка «Прошлой ночью: №5» с ответом, если он был; цель прошлой ночи на столе помечена «прошлая ночь».
- Клик по карточке или «Никого» — `recordNightAction`. Отказ `repeat_target` показывает строку «Этого игрока лечили прошлой ночью» и кнопку «Записать всё равно» (повтор с `force: true`).
- Ответ после выбора, крупно: для `check_side` — «№5 — чёрный» или «красный» и название роли мельче; при `blocked` — «заблокирован — проверка не состоялась»; для `find_role` — «№1 — шериф» или «№4 — не шериф».
- Главная кнопка: «Дальше: <следующий шаг>», на последнем шаге «Итог ночи». На сером шаге доступна только она.
- **Итог ночи**: сводка по одной строке на шаг; крупно подсказка — «№6 застрелен», «Никто не выбыл: доктор вылечил №6», «Никто не выбыл: выстрела не было», «Никто не выбыл: мафия заблокирована». Если `complete` ложно — строка «Не записано: Шериф, Доктор». Главная кнопка «№6 застрелен · начать День 3» или «Никто не выбыл · начать День 3» (`confirmNight` с `outcome.dies`); вторичные «Никто не выбыл» (`confirmNight(null)`), «Выбыл другой…» (режим выбора), «Назад к шагам ночи».
- Ночные метки на карточках (цель выстрела, заблокирован, вылечен) видны ночью и на итоге.

- [ ] **Step 1: Write the failing test (голосование)**

```ts
const voting = (a: AppStore) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'shot' });
  [7, 3, 10, 11, 4].forEach((t, i) => a.dispatch({ type: 'nominate', by: i + 1, target: t })); a.dispatch({ type: 'enterStep', step: 'vote' }); };
test('ввод голосов кнопками, остаток последнему, ничья', async () => {
  const { app, user, env } = renderApp(voting);
  for (const n of ['0', '2', '3']) await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: n }));
  expect(screen.getByText('За №11 — сколько голосов?')).toBeInTheDocument(); expect(screen.getByText(/голосуют 10 · осталось 5/)).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Число голосов' })).getAllByRole('button')).toHaveLength(6);
  await user.keyboard('2'); advance(env, 500);
  expect(app.getState().game!.day!.ballots[0]).toMatchObject({ complete: true, hint: { outcome: 'tie', seats: [10, 4] } });
  await user.click(screen.getByRole('button', { name: /Ничья №10 и №4 → речи по 30 с/ }));
  expect(app.getState().game!.step).toBe('tiebreak');
});
test('вторая ничья: решает ведущий', async () => {
  const { app, user } = renderApp((a) => { voting(a); [[7, 0], [3, 2], [10, 3], [11, 2]].forEach(([c, n]) => a.dispatch({ type: 'setVotes', ballot: 1, candidate: c!, count: n! }));
    a.dispatch({ type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [10, 4] }); a.dispatch({ type: 'enterStep', step: 'revote' });
    a.dispatch({ type: 'setVotes', ballot: 2, candidate: 10, count: 4 }); });
  expect(screen.getByText('Снова ничья')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Выгнать одного…' }));
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №4' }));
  expect(app.getState().game!.players[3]).toMatchObject({ status: 'out', cause: 'voted' }); expect(app.getState().game!.step).toBe('farewell');
});
test('никто не выгнан — сразу ночь', async () => {
  const { app, user } = renderApp(voting);
  await user.click(screen.getByRole('button', { name: /Никто не выгнан → Ночь 2/ }));
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 2 });
});
```

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/ui/vote.test.tsx`

- [ ] **Step 3: Реализуй `VotePanel` и `TieDecision`.**

- [ ] **Step 4: Run, verify PASS.** Run: `npx vitest run tests/ui/vote.test.tsx`

- [ ] **Step 5: Write the failing test (ночь)**

```ts
const night1 = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }); };
test('шаги ночи по порядку, крёстный отец получает ответ', async () => {
  const { app, user } = renderApp(night1);
  expect(within(screen.getByRole('navigation', { name: 'Шаги ночи' })).getAllByRole('button').map((b) => b.getAttribute('data-step')))
    .toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4', 'summary']);
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №6' }));
  await user.click(screen.getByRole('button', { name: /Дальше: Крёстный отец/ }));
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №1' }));
  expect(screen.getByText('№1 — шериф')).toBeInTheDocument();
  expect(app.getState().game!.night!.steps[1]).toMatchObject({ target: 1, answer: { kind: 'found', found: true } });
});
test('шериф видит сторону', async () => {
  const { user } = renderApp((a) => { night1(a); a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' }); });
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №10' })); expect(screen.getByText('№10 — чёрный')).toBeInTheDocument();
});
test('заблокированному шерифу ответа нет', () => {
  renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 1 }); a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' }); });
  expect(screen.getAllByText(/заблокирован — проверка не состоялась/).length).toBeGreaterThan(0);
});
test('доктор: прошлая ночь, предупреждение и «Записать всё равно»', async () => {
  const { app, user } = renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 5 });
    a.dispatch({ type: 'confirmNight', chosen: null }); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: 'doctor_heal:4' }); });
  expect(screen.getByText(/Прошлой ночью: №5/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' }));
  expect(screen.getByText('Этого игрока лечили прошлой ночью')).toBeInTheDocument(); expect(app.getState().game!.night!.steps.at(-1)!.recorded).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Записать всё равно' })); expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ target: 5 });
});
test('серый шаг выбывшей роли', async () => {
  renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'setStatus', seat: 1, status: 'out', cause: 'voted' });
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }); a.dispatch({ type: 'enterStep', step: 'sheriff_check' }); });
  expect(screen.getAllByText(/выбыл · разбудить для вида/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Выбрать игрока №2' })).not.toBeInTheDocument();
});
test('итог ночи: подсказка, подтверждение одной кнопкой, другой исход', async () => {
  const seed = (a: AppStore) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 6 }); a.dispatch({ type: 'enterStep', step: 'summary' }); };
  const first = renderApp(seed);
  expect(screen.getByText('№6 застрелен')).toBeInTheDocument(); expect(screen.getByText(/Не записано:/)).toBeInTheDocument();
  await first.user.click(screen.getByRole('button', { name: /№6 застрелен · начать День 2/ }));
  expect(first.app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(first.app.getState().game!.players[5]!.status).toBe('out');
  first.unmount();
  const second = renderApp(seed);
  await second.user.click(screen.getByRole('button', { name: 'Никто не выбыл' }));
  expect(second.app.getState().game!.counts.alive).toBe(11);
});
```

У каждой кнопки полосы шагов ночи есть атрибут `data-step` с id шага.

- [ ] **Step 6: Run, verify FAIL.** Run: `npx vitest run tests/ui/night.test.tsx`

- [ ] **Step 7: Реализуй `NightPanel` и `NightSummary`.**

- [ ] **Step 8: Run, verify PASS.** Run: `npm run check`

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(ui): голосование, решения ведущего, ночные шаги и итог ночи"
```

---

### Task 16: Завершение игры, итоги, правка журнала

**Files:**
- Create: `src/ui/game/StopDialog.tsx`, `src/ui/game/RecordEditor.tsx`, `src/ui/game/TimerSettings.tsx`, `src/ui/screens/SummaryScreen.tsx`, стили рядом
- Modify: `src/ui/game/JournalPanel.tsx`, `src/ui/game/Header.tsx`, `src/ui/App.tsx`
- Test: `tests/ui/finish.test.tsx`, `tests/ui/journal.test.tsx`

**Interfaces:**
- Consumes: `journal`, `journalAsText`, `playersAt`, `nightState`, `AppStore`.
- Produces: `RecordEditor: React.FC<{ entry: JournalEntry; phase: PhaseRef; onClose(): void }>`.

Поведение — по макетам `StopDialog`, `Summary` и разделам 5.9, 6.5–6.7:
- **Окно остановки**: варианты из `registry.sides` и «Без победителя», у каждой стороны число игроков в игре; «Завершить: победа чёрных» неактивна, пока сторона не выбрана; «Вернуться в игру».
- **Итоги**: победитель; таблица «номер — роль — чем закончил»; журнал целиком; «Новая игра с тем же составом» (`rematch`), «Новая игра», «Скопировать журнал» (`navigator.clipboard.writeText(journalAsText(...))`), «Возобновить игру» (`resumeGame`), «Изменить победителя» (то же окно), «На главную».
- **Настройки таймеров** из меню: пять длительностей и переключатель «Запускать таймер отдельной кнопкой»; меняют `session.config`, действуют со следующего запуска таймера.
- **Правка записи**: клик по записи журнала открывает редактор с тем же выбором, что при создании:

| Запись | Редактор | Команда |
|---|---|---|
| `night_action`, `night_missing` | сетка номеров игроков, бывших в игре на начало той ночи (`playersAt`), и «Никого» | `recordNightAction` с `phase` |
| `nomination` | сетка номеров, «Удалить запись» | `removeNomination` и `nominate` с `phase` |
| `votes` | числа по кандидатам | `setVotes` с `phase` |
| `status` | «Застрелен», «Выгнан», «Вернуть в игру», «Удалить запись» | `setStatus` с `phase`, `removeEvent` |
| `circle`, `swap` | «Удалить запись» | `removeEvent` |

- У группы прошлого дня есть «Добавить запись…»: выставление или смена статуса с `phase` этого дня.
- Предупреждение `night_outcome_changed` показывается строкой над журналом: «Итог Ночи 1 теперь другой: выбыть должен №9. Исправить статусы?» с кнопками «Исправить» (`acknowledgeNight` с `apply: true`) и «Оставить». Если `expected` равно `null`, текст — «никто не должен выбыть».

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/finish.test.tsx
test('остановка: выбор стороны, итоги, возобновление', async () => {
  const { app, user } = renderApp((a) => seedGame(a, TABLE_11, 2));
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByRole('button', { name: /^Завершить/ })).toBeDisabled();
  await user.click(dialog.getByRole('radio', { name: /Чёрные/ })); await user.click(dialog.getByRole('button', { name: 'Завершить: победа чёрных' }));
  expect(app.getState().screen).toBe('summary'); expect(screen.getByText('Победа чёрных')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(12);
  await user.click(screen.getByRole('button', { name: 'Возобновить игру' })); expect(app.getState().screen).toBe('game');
});
test('без победителя и новая игра с тем же составом', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'finishGame', winner: null }); });
  expect(screen.getByText('Без победителя')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Новая игра с тем же составом' }));
  expect(app.getState()).toMatchObject({ screen: 'setup', draft: { playerCount: 11 } });
});
test('журнал копируется текстом', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined); Object.assign(navigator, { clipboard: { writeText } });
  const { user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'finishGame', winner: 'red' }); });
  await user.click(screen.getByRole('button', { name: 'Скопировать журнал' }));
  expect(writeText.mock.calls[0]![0]).toContain('Распределение');
});

// tests/ui/journal.test.tsx
const afterNight = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } });
  a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 }); a.dispatch({ type: 'confirmNight', chosen: 7 }); };
test('правка прошлой ночи предлагает исправить статусы', async () => {
  const { app, user } = renderApp(afterNight);
  await user.click(screen.getByRole('button', { name: /^Ночь 1/ }));
  await user.click(screen.getByRole('button', { name: /Мафия → №7/ }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №9' }));
  expect(app.getState().game!.players[6]!.status).toBe('out');
  expect(screen.getByText(/Итог Ночи 1 теперь другой: выбыть должен №9/)).toBeInTheDocument(); expect(screen.getByText('испр.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Исправить' }));
  expect(app.getState().game!.players[6]!.status).toBe('alive'); expect(app.getState().game!.players[8]!.status).toBe('out');
});
test('в редакторе прошлой ночи доступны те, кто был тогда в игре', async () => {
  const { user } = renderApp(afterNight);
  await user.click(screen.getByRole('button', { name: /^Ночь 1/ }));
  await user.click(screen.getByRole('button', { name: /Шериф — не записано/ }));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №7' })).toBeEnabled();
});
test('настройки таймеров действуют со следующего запуска', async () => {
  const { app, user } = renderApp((a) => seedGame(a, TABLE_11, 1));
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Настройки таймеров' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Речь игрока: больше' }));
  expect(app.getState().session!.config.durations.speech).toBe(65);
});
```

Шаг счётчика длительности — 5 секунд, границы 10–300.

- [ ] **Step 2: Run, verify FAIL.** Run: `npx vitest run tests/ui/finish.test.tsx tests/ui/journal.test.tsx`

- [ ] **Step 3: Реализуй окно остановки, итоги, настройки таймеров, редактор записей.** Для изменения `session.config` добавь в `AppStore` метод `updateConfig(patch: Partial<SessionConfig>): void` с сохранением.

- [ ] **Step 4: Run, verify PASS.** Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): завершение игры, итоги, правка записей журнала"
```

---

### Task 17: Сборка в один файл и приёмка

**Files:**
- Create: `README.md`, `docs/acceptance.md`
- Modify: по найденным расхождениям

**Interfaces:**
- Consumes: всё приложение.
- Produces: `dist/index.html`, готовый к игре.

- [ ] **Step 1: Собери и проверь файл**

Run: `npm run check && npm run build && ls dist && grep -cE "https?://(fonts|cdn)" dist/index.html`
Expected: тесты проходят; в `dist` один файл `index.html`; grep печатает `0`.

- [ ] **Step 2: Сверь внешний вид с макетами.** Открой приложение (`npm run preview`) в окне шириной 1440 px и пройди экраны по списку из раздела 6.10 спецификации, сравнивая с исходниками в `docs/design/mockups/`: цвета из таблицы, шрифты Golos Text и Oswald, размеры кнопок и карточек, синий акцент ночью и янтарный днём. Проверь ширину 1024 px и стол на 20 игроков. Расхождения исправь.

- [ ] **Step 3: Пройди приёмочный сценарий.** Открой `dist/index.html` с диска двойным кликом в Chrome и пройди все 11 шагов приёмочного сценария из раздела 8 спецификации. Отдельно проверь: после обновления страницы посреди оправдания шаг и таймер на месте; после закрытия и повторного открытия файла игра на месте; сигнал по нулю слышен; экран не гаснет во время игры. Если инструмент браузера не открывает файлы с диска, пройди сценарий на `npm run preview` и запиши, что проверка с диска и в Safari осталась заказчику.

- [ ] **Step 4: Запиши результат.** В `docs/acceptance.md` — таблица из 11 шагов сценария: прошёл или нет, что именно проверено, в каком браузере и каким способом запуска. Непройденные шаги исправь и перепроверь; то, что проверить не удалось, перечисли отдельно.

- [ ] **Step 5: Напиши `README.md`.** Как собрать (`npm install`, `npm run build`), как запустить на игре (открыть `dist/index.html`), где лежат сохранённые игры и что они привязаны к браузеру и расположению файла, как добавить роль (запись в `src/engine/roles/registry.ts` и строки в обоих словарях), клавиши.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: приёмка и руководство по запуску"
```

---

## Соответствие спецификации

| Раздел спецификации | Задачи |
|---|---|
| 5.1 Состав, крёстный отец | 2, 11 |
| 5.2 Раздача, обмен ролями | 3, 5, 11 |
| 5.3 Нумерация фаз | 4, 5 |
| 5.4–5.5 Ночь и итог ночи | 7, 15 |
| 5.6–5.7 День, выставление | 6, 13 |
| 5.8 Голосование | 6, 15 |
| 5.9 Конец игры | 5, 12, 16 |
| 5.10 Ручное управление | 5, 6, 12 |
| 6.1–6.3 Принципы, каркас, карточка | 12 |
| 6.4 Таймер | 9, 13, 14 |
| 6.5–6.6 Журнал, исправление ошибок | 4, 8, 10, 12, 16 |
| 6.7 Экраны | 11–16 |
| 6.8 Клавиши | 14, 15 |
| 6.9 Языки | 11 |
| 6.10 Визуальный стиль | 1, 17 |
| 7 Устройство приложения | 1–10 |
| 8 Проверка | 8, 17 |
