# Свои роли — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ведущий создаёт свои роли на экране состава (название, цвет, ходит ли ночью); они участвуют в раздаче и игре, а ночная роль получает шаг ночи, выбор которого только записывается.

**Architecture:** Справочник ролей собирается на лету функцией `registryFor(base, customRoles)`: встроенный справочник плюс свои роли. Перечень своих ролей живёт в настройках браузера, копия участвующих — в `session.config.customRoles`. Ночное действие своей роли — новый эффект `note`, который не участвует в расчёте итога ночи. Названия своих ролей хранятся в самой роли, а не в словаре.

**Tech Stack:** как в проекте: Vite, React 19, TypeScript, Vitest + Testing Library, ESLint.

**Spec:** `docs/superpowers/specs/2026-11-15-custom-roles-design.md` (дополнение) и `docs/superpowers/specs/2026-11-14-mafia-host-design.md` (основная). Макеты: `docs/design/mockups/SetupCustomRole.dc.html`, `docs/design/mockups/NightCustomStep.dc.html`.

## Global Constraints

- Вне `src/engine/roles/` нет строковых литералов идентификаторов ролей и сторон (тест `tests/engine/purity.test.ts`). Свои роли приходят данными.
- Движок чистый: без React, DOM, `Date.now`, `Math.random`, `localStorage`. Слои: `ui → app → engine`, `platform` только в `app`.
- Каждая строка интерфейса есть в `src/app/i18n/ru.ts` и `src/app/i18n/uk.ts` под одним ключом.
- Название своей роли: 1–24 знака после `trim`, показывается как введено на обоих языках.
- Своих ролей не больше 8. Идентификатор своей роли не содержит `:` (на `:` делится идентификатор ночного шага).
- Сбой и мусор в хранилище не роняют приложение; старые сохранения без `customRoles` открываются.
- `npm run check` проходит перед каждым коммитом. Коммит после каждой задачи. Ничего не пушить.
- Тест пишется раньше кода и сначала падает по ожидаемой причине.
- Поведение — по спецификации, внешний вид — по макетам. Вопрос о правилах игры без ответа в спецификации — остановиться и спросить заказчика, не придумывать.

## Review Focus

1. **Старые и испорченные данные.** Сессия без `customRoles` открывается; `customRoles` в настройках не массив или с негодными записями — перечень пуст или очищен, главная открывается. Тесты — в задаче 3.
2. **Название роли.** Пробелы по краям, 40 знаков, `<b>жирный</b>`, одно длинное слово, совпадение со встроенной ролью в другом регистре и на другом языке. Ожидание: обрезка, текст как текст, отказ с понятной ошибкой. Тесты — в задачах 3 и 4.
3. **Роль удалена из перечня, а игра с ней идёт или завершена.** Игра открывается и показывает название. Тест — в задаче 3.
4. **Носитель своей роли меняет статус или роль прямо на её шаге.** Шаг остаётся шагом той же роли (серым или активным). Тест — в задаче 1.
5. **Свои роли заняли все места.** Ролей больше, чем игроков, — раздать нельзя, текст ошибки называет лишние; мирных 0 — раздача проходит. Тест — в задаче 4.

## Файлы

| Файл | Что в нём |
|---|---|
| `src/engine/roles/custom.ts` (новый) | `registryFor`, `sanitizeCustomRoles`, границы |
| `src/engine/types.ts` | `CustomRole`, эффект `note`, поля `name` и `custom` у роли, `customRoles` в настройках сессии |
| `src/engine/setup.ts` | `nightOrder` |
| `src/app/i18n/index.ts`, `journalText.ts`, `ru.ts`, `uk.ts` | названия ролей и шагов, новые строки |
| `src/app/customRoles.ts` (новый) | проверка названия, занятые названия |
| `src/platform/storage.ts` | `customRoles` в настройках и в проверке сессии |
| `src/app/store.ts` | справочник по контексту, команды перечня ролей, копия ролей в сессии |
| `src/ui/screens/SetupScreen.tsx`, `CustomRoleForm.tsx` (новый), `prepare.css` | строки своих ролей, форма, блок «Ночью просыпаются» |
| `src/ui/game/NightPanel.tsx`, `nightMarks.ts`, `StepNav.tsx`, `labels.ts`, `StopDialog.tsx`, `src/ui/screens/DealScreen.tsx`, `game.css` | ночной шаг своей роли, названия |
| `tests/…` | по задачам |

---

### Task 1: Движок — справочник со своими ролями и действие «запись»

**Files:**
- Create: `src/engine/roles/custom.ts`, `tests/engine/custom-roles.test.ts`
- Modify: `src/engine/types.ts`, `src/engine/setup.ts`, `src/engine/index.ts`, `tests/helpers.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type EffectId = 'kill' | 'heal' | 'block' | 'check_side' | 'find_role' | 'note'
  /** Роль, которую создал ведущий. night — у роли есть ночной шаг, выбор которого только записывается. */
  export type CustomRole = { id: RoleId; name: string; side: SideId; night: boolean }
  // RoleDef: + name?: string (готовое название, показывается как есть) и + custom?: true
  // SessionConfig: + customRoles?: CustomRole[]

  // roles/custom.ts
  export const MAX_CUSTOM_ROLES = 8
  export const MAX_ROLE_NAME = 24
  export function customActionId(roleId: RoleId): string            // `act_${roleId}`
  export function sanitizeCustomRoles(base: Registry, input: unknown): CustomRole[]
  export function registryFor(base: Registry, custom: readonly CustomRole[] | undefined): Registry

  // setup.ts
  /** Ночные действия состава по порядку: те, у кого в колоде есть хотя бы один исполнитель. */
  export function nightOrder(registry: Registry, deck: readonly RoleId[]): NightActionDef[]
  ```
- `registryFor`: пустой или отсутствующий перечень — возвращает `base` тем же объектом. Иначе роли `{ id, nameKey: '', name, side, defaultCount: 0, seenBySheriffAs: side, custom: true }` дописываются после встроенных; для роли с `night: true` — действие `{ id: customActionId(id), order: 100 + индекс роли в перечне, effect: 'note', performers: [id], scope: 'each', stepKey: '', questionKey: '' }`. Результат запоминается по самому массиву (`WeakMap`): тот же массив — тот же объект справочника. Вход всегда проходит `sanitizeCustomRoles`.
- `sanitizeCustomRoles`: не массив — `[]`; запись годна, если `id` — непустая строка без `:`, не совпадает со встроенной ролью и не повторяется; `name` — строка, после `trim` непустая (длиннее 24 — обрезается); `side` есть в `base.sides`; `night` — boolean. Берутся первые 8 годных.
- `night.ts`, `commands.ts`, `journal.ts` менять не нужно: эффект `note` в расчёте итога не упоминается, шаги и блок работают по общим правилам. Это проверяют тесты ниже.

- [x] **Step 1: Помощники тестов** — в `tests/helpers.ts`:

```ts
export const JOURNALIST: CustomRole = { id: 'custom_j', name: 'журналист', side: 'red', night: true }
export const MANIAC: CustomRole = { id: 'custom_m', name: 'маньяк', side: 'black', night: false }
/** №1 шериф, №3 крёстный отец, №4 доктор, №6 журналист, №8 мафия, №9 маньяк, №10 проститутка. */
export const CUSTOM_TABLE = ['sheriff', 'civilian', 'godfather', 'doctor', 'civilian', 'custom_j', 'civilian', 'mafia', 'custom_m', 'prostitute', 'civilian']
/** Игра со своими ролями на начало Ночи 1 и её справочник. */
export function customNight(roles: CustomRole[] = [JOURNALIST, MANIAC], assignment: RoleId[] = CUSTOM_TABLE): { s: Session; registry: Registry }
```

`customNight` собирает `registryFor(DEFAULT_REGISTRY, roles)`, сессию через `gameWith(registry, assignment, { customRoles: roles })` и доводит её до Ночи 1 командами `startPhase` через `playWith(registry, …)`.

- [x] **Step 2: Падающие тесты** — `tests/engine/custom-roles.test.ts`:

```ts
const ROLES = [JOURNALIST, MANIAC]
const R = registryFor(DEFAULT_REGISTRY, ROLES)
const night = (s: Session) => nightState(s, R, 1)
const rec = (s: Session, ...cmds: Command[]) => playWith(R, s, ...cmds)

test('без своих ролей справочник — тот же объект; тот же перечень — тот же справочник', () => {
  expect(registryFor(DEFAULT_REGISTRY, [])).toBe(DEFAULT_REGISTRY)
  expect(registryFor(DEFAULT_REGISTRY, undefined)).toBe(DEFAULT_REGISTRY)
  expect(registryFor(DEFAULT_REGISTRY, ROLES)).toBe(R)
})
test('свои роли стоят после встроенных; ночная получает действие «запись» в конце очереди', () => {
  expect(configurableRoles(R).map((r) => r.id)).toEqual(['mafia', 'prostitute', 'sheriff', 'doctor', 'custom_j', 'custom_m'])
  expect(R.roles.find((r) => r.id === 'custom_j')).toMatchObject({ name: 'журналист', side: 'red', seenBySheriffAs: 'red', custom: true, defaultCount: 0 })
  expect(R.nightActions.at(-1)).toMatchObject({ id: 'act_custom_j', effect: 'note', performers: ['custom_j'], scope: 'each' })
  expect(R.nightActions.at(-1)!.order).toBeGreaterThan(Math.max(...DEFAULT_REGISTRY.nightActions.map((a) => a.order)))
  expect(R.nightActions.some((a) => a.performers.includes('custom_m'))).toBe(false)
})
test('негодные записи перечня пропускаются', () => {
  const long = { id: 'c3', name: `  ${'д'.repeat(40)}  `, side: 'red', night: false }
  const dirty = [JOURNALIST, { ...JOURNALIST }, { id: 'a:b', name: 'x', side: 'red', night: false }, { id: 'mafia', name: 'x', side: 'red', night: false },
    { id: 'c1', name: '   ', side: 'red', night: false }, { id: 'c2', name: 'x', side: 'green', night: false }, long, null, 'роль']
  expect(sanitizeCustomRoles(DEFAULT_REGISTRY, dirty)).toEqual([JOURNALIST, { id: 'c3', name: 'д'.repeat(24), side: 'red', night: false }])
  expect(sanitizeCustomRoles(DEFAULT_REGISTRY, 'мусор')).toEqual([])
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `роль ${i}`, side: 'red', night: false }))
  expect(sanitizeCustomRoles(DEFAULT_REGISTRY, many)).toHaveLength(8)
})
test('состав считает свои роли по цвету; ролей больше игроков — раздать нельзя', () => {
  const check = checkComposition(11, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1, custom_j: 1, custom_m: 1 }, R)
  expect(check.errors).toEqual([]); expect(check.civilians).toBe(4); expect(check.bySide).toEqual({ black: 4, red: 7 })
  expect(check.deck.filter((c) => c === 'custom_j')).toHaveLength(1)
  expect(checkComposition(4, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1, custom_j: 1 }, R).errors).toEqual(['too_many_roles'])
  expect(checkComposition(6, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1, custom_j: 1 }, R)).toMatchObject({ errors: [], civilians: 0 })
})
test('порядок ночи для состава', () => {
  const deck = checkComposition(11, { mafia: 2, prostitute: 1, doctor: 1, custom_j: 1, custom_m: 1 }, R).deck
  expect(nightOrder(R, deck).map((a) => a.id)).toEqual(['mafia_shot', 'godfather_search', 'prostitute_block', 'doctor_heal', 'act_custom_j'])
})
test('шаг своей роли — последний; роль, которая ночью спит, шага не имеет', () => {
  expect(night(customNight().s).steps.map((x) => x.id))
    .toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4', 'act_custom_j:6'])
})
test('запись своей роли не меняет итог ночи', () => {
  const shot = rec(customNight().s, act('mafia_shot', null, 7))
  const noted = rec(shot, act('act_custom_j', 6, 7))
  expect(night(noted).outcome).toEqual(night(shot).outcome)
  expect(night(noted).outcome.dies).toBe(7)
  expect(night(noted).steps.at(-1)).toMatchObject({ effect: 'note', recorded: true, target: 7, blocked: false })
})
test('проститутка заблокировала носителя — шаг помечен, запись остаётся', () => {
  const s = rec(customNight().s, act('prostitute_block', 10, 6), act('act_custom_j', 6, 2))
  expect(night(s).steps.at(-1)).toMatchObject({ blocked: true, recorded: true, target: 2 })
})
test('шериф видит цвет своей роли, крёстный отец получает «не шериф»', () => {
  const answer = (s: Session, id: string) => night(s).steps.find((x) => x.id === id)!.answer
  expect(answer(rec(customNight().s, act('sheriff_check', 1, 9)), 'sheriff_check:1')).toEqual({ kind: 'side', side: 'black' })
  expect(answer(rec(customNight().s, act('sheriff_check', 1, 6)), 'sheriff_check:1')).toEqual({ kind: 'side', side: 'red' })
  expect(answer(rec(customNight().s, act('godfather_search', 3, 6)), 'godfather_search:3')).toEqual({ kind: 'found', found: false })
})
test('чёрная своя роль выстрел не наследует', () => {
  const s = rec(customNight().s, ...[3, 8, 10].map((seat): Command => ({ type: 'setStatus', seat, status: 'out', cause: 'voted' })))
  expect(night(s).steps.find((x) => x.actionId === 'mafia_shot')).toMatchObject({ grey: true })
})
test('две карты одной своей роли — два шага', () => {
  const table = CUSTOM_TABLE.map((r, i) => (i === 6 ? 'custom_j' : r))
  expect(night(customNight(ROLES, table).s).steps.slice(-2).map((x) => x.id)).toEqual(['act_custom_j:6', 'act_custom_j:7'])
})
test('носитель выбыл на своём шаге — ведущий остаётся на шаге этой роли, шаг серый', () => {
  const s = rec(customNight().s, { type: 'enterStep', step: 'act_custom_j:6' }, { type: 'setStatus', seat: 6, status: 'out', cause: 'voted' })
  const game = deriveState(s, R)
  expect(game.step).toBe('act_custom_j')
  expect(game.night!.steps.at(-1)).toMatchObject({ grey: true })
})
```

- [x] **Step 3: Запустить** — `npx vitest run tests/engine/custom-roles.test.ts`. Ожидание: FAIL, `registryFor` не существует.
- [x] **Step 4: Реализовать** типы, `src/engine/roles/custom.ts`, `nightOrder` в `setup.ts`, экспорт из `src/engine/index.ts` (`export * from './roles/custom'`).
- [x] **Step 5: Запустить** тот же файл — PASS; затем `npm run check` — PASS.
- [x] **Step 6: Commit** — `feat(engine): свои роли в справочнике и ночное действие «запись»`.

---

### Task 2: Названия и тексты

**Files:**
- Modify: `src/app/i18n/index.ts`, `src/app/i18n/journalText.ts`, `src/app/i18n/ru.ts`, `src/app/i18n/uk.ts`, `src/ui/game/labels.ts`
- Test: `tests/app/custom-i18n.test.ts`

**Interfaces:**
- Consumes: `registryFor`, `JOURNALIST`, `MANIAC` (задача 1).
- Produces (в `src/app/i18n/index.ts`):
  ```ts
  /** Название роли: у своей — как ввёл ведущий, у встроенной — из словаря. */
  export function roleTitle(lang: Lang, def: RoleDef): string
  /** Название ночного шага без номера носителя: «Мафия», «Журналист». */
  export function stepName(lang: Lang, registry: Registry, def: NightActionDef): string
  /** Вопрос шага над столом: «В кого стреляет мафия?», «Кого выбирает журналист?». */
  export function stepQuestion(lang: Lang, registry: Registry, def: NightActionDef, performerRole: RoleId, inherited: boolean): string
  ```
- `roleTitle` = `def.name ?? translateKey(lang, def.nameKey)`. На него переходят `roleLabel`, `roleName`, `compositionText`.
- `stepName`: есть строка `def.stepKey` — она; иначе `cap(roleName(…, def.performers[0]))`. На него переходят `nightStepLabel` в `labels.ts` и `performer` в `journalText.ts`.
- `stepQuestion`: наследованный шаг и есть `${def.questionKey}.inherited` — она с `{role}`; есть `def.questionKey` — она; иначе `night.custom.question` с `{role}`.
- `summaryBody`: в шаблон `effect.<эффект>.summary` кроме `target` передаётся `role` — название роли исполнителя записи.

Новые строки (ключ — русский / украинский):

| Ключ | ru | uk |
|---|---|---|
| `role.custom.tag` | своя роль | своя роль |
| `role.custom.about.night` | ходит ночью, выбор записывается | ходить уночі, вибір записується |
| `role.custom.about.passive` | ночью спит | уночі спить |
| `side.black.seen` | чёрной | чорною |
| `side.red.seen` | красной | червоною |
| `setup.custom.add` | Добавить свою роль | Додати свою роль |
| `setup.custom.add.hint` | название, цвет и ходит ли она ночью | назва, колір і чи ходить вона вночі |
| `setup.custom.new` | Новая роль | Нова роль |
| `setup.custom.edit` | Изменить роль | Змінити роль |
| `setup.custom.name` | Название | Назва |
| `setup.custom.name.hint` | До 24 знаков. Показывается как написано — и на русском, и на украинском. | До 24 знаків. Показується як написано — і російською, і українською. |
| `setup.custom.side` | За кого играет | За кого грає |
| `setup.custom.side.hint` | Идёт в счётчик {gen}. Шериф при проверке видит её {seen}. | Йде в лічильник {gen}. Шериф під час перевірки бачить її {seen}. |
| `setup.custom.night` | Ходит ночью | Ходить уночі |
| `setup.custom.night.hint` | У роли будет свой шаг в ночи — последним в очереди. Приложение запишет, кого она выбрала. Что этот выбор значит, решаешь ты: на подсказку итога ночи он не влияет. | У ролі буде свій крок уночі — останнім у черзі. Застосунок запише, кого вона обрала. Що цей вибір означає, вирішуєш ти: на підказку підсумку ночі він не впливає. |
| `setup.custom.submit` | Добавить роль | Додати роль |
| `setup.custom.save` | Сохранить | Зберегти |
| `setup.custom.editAria` | Изменить роль «{role}» | Змінити роль «{role}» |
| `setup.custom.deleteAria` | Удалить роль «{role}» | Видалити роль «{role}» |
| `setup.custom.error.empty` | Введите название роли. | Введіть назву ролі. |
| `setup.custom.error.duplicate` | Роль с таким названием уже есть. | Роль із такою назвою вже є. |
| `setup.custom.limit` | Своих ролей может быть не больше 8. | Своїх ролей може бути не більше 8. |
| `setup.nightOrder` | Ночью просыпаются | Уночі прокидаються |
| `setup.nightOrder.hint` | по порядку | по черзі |
| `setup.nightOrder.none` | Ночью никто не просыпается. | Уночі ніхто не прокидається. |
| `night.custom.question` | Кого выбирает {role}? | Кого обирає {role}? |
| `night.recorded` | Записано · {step} | Записано · {step} |
| `night.custom.note` | Приложение только записывает выбор. Что он значит, решаешь ты: на подсказку итога ночи он не влияет. | Застосунок лише записує вибір. Що він означає, вирішуєш ти: на підказку підсумку ночі він не впливає. |
| `night.blocked.note` | заблокирован — действие не состоялось | заблокований — дія не відбулася |
| `night.mark.note` | выбор: {role} | вибір: {role} |
| `effect.note` | выбор | вибір |
| `effect.note.summary` | {role} → {target} | {role} → {target} |
| `setup.deck.aria` | Колода | Колода |

- [x] **Step 1: Падающие тесты** — `tests/app/custom-i18n.test.ts`:

```ts
const R = registryFor(DEFAULT_REGISTRY, [JOURNALIST, MANIAC])
const role = (id: string) => R.roles.find((r) => r.id === id)!
const action = (id: string) => R.nightActions.find((a) => a.id === id)!

test('название своей роли одинаково на обоих языках, встроенной — переводится', () => {
  expect(roleTitle('ru', role('custom_j'))).toBe('журналист'); expect(roleTitle('uk', role('custom_j'))).toBe('журналист')
  expect(roleTitle('uk', role('doctor'))).toBe('лікар')
  expect(roleName('uk', R, 'custom_m')).toBe('маньяк'); expect(roleLabel('ru', R, 'custom_j').name).toBe('журналист')
})
test('шаг и вопрос своей роли строятся из её названия', () => {
  expect(stepName('ru', R, action('act_custom_j'))).toBe('Журналист')
  expect(stepName('ru', R, action('mafia_shot'))).toBe('Мафия')
  expect(stepQuestion('ru', R, action('act_custom_j'), 'custom_j', false)).toBe('Кого выбирает журналист?')
  expect(stepQuestion('uk', R, action('act_custom_j'), 'custom_j', false)).toBe('Кого обирає журналист?')
  expect(stepQuestion('ru', R, action('doctor_heal'), 'doctor', false)).toBe('Кого лечит доктор?')
  expect(stepQuestion('ru', R, action('mafia_shot'), 'prostitute', true)).toBe('В кого стреляет проститутка?')
})
test('состав и журнал называют свою роль', () => {
  expect(compositionText('ru', R, { godfather: 1, mafia: 1, custom_j: 1, custom_m: 1, civilian: 4 })).toBe('мафия 2 (из них крёстный отец 1), журналист 1, маньяк 1, мирных 4')
  const { s } = customNight()
  const done = playWith(R, s, act('mafia_shot', null, 7), act('act_custom_j', 6, 9), { type: 'confirmNight', chosen: 7 })
  const group = journal(done, R).find((g) => g.phase.kind === 'night')!
  expect(group.entries.map((e) => entryText('ru', e, R))).toContain('Журналист → №9')
  expect(summaryBody('ru', group, R)).toContain('журналист → №9')
})
```

Тест одинакового набора ключей в двух словарях уже есть (`tests/app/i18n.test.ts`) и должен остаться зелёным.

- [x] **Step 2: Запустить** — FAIL, `roleTitle` не существует.
- [x] **Step 3: Реализовать** функции, перевести на них `roleLabel`, `roleName`, `compositionText`, `performer`, `nightStepLabel`; добавить строки таблицы в оба словаря.
- [x] **Step 4: Запустить** файл — PASS; `npm run check` — PASS.
- [x] **Step 5: Commit** — `feat(i18n): названия своих ролей и тексты для них`.

---

### Task 3: Хранение и состояние приложения

**Files:**
- Create: `src/app/customRoles.ts`, `tests/app/custom-roles.test.ts`
- Modify: `src/platform/storage.ts`, `src/app/store.ts`, `tests/ui/helpers.tsx`

**Interfaces:**
- Consumes: `registryFor`, `sanitizeCustomRoles`, `MAX_CUSTOM_ROLES`, `MAX_ROLE_NAME` (задача 1); `roleTitle` (задача 2).
- Produces:
  ```ts
  // storage.ts
  export type Settings = { lang: Lang; sound: boolean; rolesHidden: boolean; lastConfig: SessionConfig | null; customRoles: CustomRole[] }
  // DEFAULT_SETTINGS.customRoles = []

  // app/customRoles.ts
  export type RoleInput = { name: string; side: SideId; night: boolean }
  export type RoleIssue = 'empty' | 'duplicate' | 'limit'
  /** Название после trim и обрезки до 24 знаков. */
  export function cleanRoleName(name: string): string
  /** Названия, занятые другими ролями: свои (кроме exceptId) и встроенные на обоих языках, в нижнем регистре. */
  export function takenNames(base: Registry, custom: readonly CustomRole[], exceptId?: RoleId): Set<string>
  export function checkRoleName(name: string, taken: ReadonlySet<string>): 'empty' | 'duplicate' | null

  // store.ts — AppStore
  registry: Registry                                   // getter: справочник идущей сессии, без сессии — справочник перечня из настроек
  addCustomRole(input: RoleInput): RoleIssue | null     // id = `custom_${env.newId()}`; composition[id] = 1
  updateCustomRole(id: RoleId, input: RoleInput): RoleIssue | null
  removeCustomRole(id: RoleId): void                    // убирает и из composition черновика
  ```
- `storage.settings()`: `customRoles` — массив записей с полями нужных типов (`id`, `name`, `side` — строки, `night` — boolean), иначе `[]`; смысловую проверку делает `registryFor`. `looksLikeConfig` принимает конфигурацию, если `customRoles` нет или это массив.
- `store`: внутри вместо одного `registry` — `registryFor(env.registry, session.config.customRoles)` для сессии и `registryFor(env.registry, state.settings.customRoles)` для экрана состава. `metaOf(session, base = DEFAULT_REGISTRY)` строит справочник сессии сам.
- `dealDraft`: в настройки сессии кладётся `customRoles` — роли перечня, у которых в составе количество больше 0.
- `rematch` и `backToSetup`: роли из `session.config.customRoles`, которых нет в перечне (по `id`), возвращаются в перечень, пока не достигнут предел 8.
- Изменение перечня сразу сохраняется в настройки (`storage.saveSettings`).
- `tests/ui/helpers.tsx`: `seedCustomGame(app, roles, assignment, day)` — как `seedGame`, но сессия со своими ролями и справочником `registryFor`.

- [x] **Step 1: Падающие тесты** — `tests/app/custom-roles.test.ts`:

```ts
const input = { name: '  Журналист ', side: 'red', night: true }

test('добавленная роль в перечне, в составе с количеством 1 и в справочнике экрана состава', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame()
  expect(app.addCustomRole(input)).toBeNull()
  const [role] = app.getState().settings.customRoles
  expect(role).toMatchObject({ name: 'Журналист', side: 'red', night: true }); expect(role!.id).toMatch(/^custom_/)
  expect(app.getState().draft.composition[role!.id]).toBe(1)
  expect(app.registry.roles.at(-1)).toMatchObject({ id: role!.id, custom: true })
  // перечень пережил перезапуск, хотя игру не раздавали
  expect(createAppStore(testEnv(env.kv)).getState().settings.customRoles).toEqual([role])
})
test('название проверяется: пустое, длинное, занятое', () => {
  const app = createAppStore(testEnv()); app.newGame()
  expect(app.addCustomRole({ ...input, name: '   ' })).toBe('empty')
  expect(app.addCustomRole({ ...input, name: 'ШЕРИФ' })).toBe('duplicate')
  expect(app.addCustomRole({ ...input, name: 'лікар' })).toBe('duplicate')
  expect(app.addCustomRole({ ...input, name: 'я'.repeat(40) })).toBeNull()
  expect(app.getState().settings.customRoles[0]!.name).toBe('я'.repeat(24))
  expect(app.addCustomRole(input)).toBeNull(); expect(app.addCustomRole({ ...input, name: 'журналист' })).toBe('duplicate')
})
test('не больше восьми своих ролей', () => {
  const app = createAppStore(testEnv()); app.newGame()
  for (let i = 0; i < 8; i++) expect(app.addCustomRole({ ...input, name: `роль ${i}` })).toBeNull()
  expect(app.addCustomRole({ ...input, name: 'девятая' })).toBe('limit')
  expect(app.getState().settings.customRoles).toHaveLength(8)
})
test('правка и удаление', () => {
  const app = createAppStore(testEnv()); app.newGame(); app.addCustomRole(input)
  const id = app.getState().settings.customRoles[0]!.id
  expect(app.updateCustomRole(id, { name: 'Репортёр', side: 'black', night: false })).toBeNull()
  expect(app.getState().settings.customRoles).toEqual([{ id, name: 'Репортёр', side: 'black', night: false }])
  expect(app.updateCustomRole(id, { name: 'мафия', side: 'black', night: false })).toBe('duplicate')
  app.removeCustomRole(id)
  expect(app.getState().settings.customRoles).toEqual([]); expect(app.getState().draft.composition).not.toHaveProperty([id])
})
test('игра хранит копию участвующих ролей и открывается после удаления роли из перечня', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame()
  app.addCustomRole(input); app.addCustomRole({ name: 'Маньяк', side: 'black', night: false })
  const [j, m] = app.getState().settings.customRoles
  app.editDraft({ playerCount: 11, composition: { ...app.getState().draft.composition, [m!.id]: 0 } })
  app.dealDraft()
  expect(app.getState().session!.config.customRoles).toEqual([j])
  expect(app.getState().game!.players.filter((p) => p.roleId === j!.id)).toHaveLength(1)
  app.goHome(); app.removeCustomRole(j!.id)
  const again = createAppStore(testEnv(env.kv)); again.openSession(app.getState().sessions[0]!.id)
  expect(again.getState().brokenSession).toBeNull()
  expect(again.registry.roles.find((r) => r.id === j!.id)).toMatchObject({ name: 'Журналист' })
  again.rematch()
  expect(again.getState().settings.customRoles.map((r) => r.id)).toContain(j!.id)
})
test('сессия без customRoles и мусор в настройках не мешают запуску', () => {
  const env = testEnv(); const app = seeded(env)                      // игра без своих ролей, как до обновления
  expect(app.getState().session!.config.customRoles ?? []).toEqual([])
  env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'ru', customRoles: 'мусор' }))
  expect(createAppStore(testEnv(env.kv)).getState().settings.customRoles).toEqual([])
  env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'ru', customRoles: [{ id: 5 }, { id: 'c1', name: 'ок', side: 'red', night: false }] }))
  const next = createAppStore(testEnv(env.kv))
  expect(next.getState().settings.customRoles.map((r) => r.name)).toEqual(['ок'])
  expect(next.getState().game).not.toBeNull()
})
```

- [x] **Step 2: Запустить** — FAIL, `addCustomRole` не существует.
- [x] **Step 3: Реализовать** `src/app/customRoles.ts`, правки `storage.ts` и `store.ts`, помощник `seedCustomGame`.
- [x] **Step 4: Запустить** файл — PASS; `npm run check` — PASS (старые тесты `store`, `storage` и интерфейса не меняются).
- [x] **Step 5: Commit** — `feat(app): перечень своих ролей в настройках и копия в сессии`.

---

### Task 4: Экран «Состав»

**Files:**
- Create: `src/ui/screens/CustomRoleForm.tsx`, `tests/ui/custom-setup.test.tsx`
- Modify: `src/ui/screens/SetupScreen.tsx`, `src/ui/screens/prepare.css`

**Interfaces:**
- Consumes: `addCustomRole`, `updateCustomRole`, `removeCustomRole`, `settings.customRoles`, `store.registry` (задача 3); `nightOrder` (задача 1); `roleTitle`, `stepName` и строки (задача 2).
- Produces:
  ```tsx
  export function CustomRoleForm(props: {
    title: string; submitLabel: string
    initial?: RoleInput
    onSubmit(input: RoleInput): RoleIssue | null   // null — форма закрывается
    onCancel(): void
  }): JSX.Element
  ```
- Разметка — по макету `SetupCustomRole.dc.html`: строка своей роли (выключатель, точка, название, пометка `role.custom.tag`, подпись «сторона · about», кнопки «изменить» и «удалить» с `aria-label` из словаря, счётчик); под мирными кнопка `setup.custom.add`; форма — `<form aria-label>` с `<label>`+`<input maxLength={24}>`, `<fieldset>` с двумя кнопками `role="radio"` по сторонам справочника, выключатель `role="switch"`, кнопки «Добавить роль» (`type="submit"`) и «Отмена». По умолчанию: первая сторона справочника, «Ходит ночью» включено.
- Enter в поле отправляет форму (горячая клавиша раздачи в поле ввода и так не действует); Escape в форме вызывает `onCancel`. Ошибка — строкой `role="alert"` под полем.
- «Изменить» показывает форму на месте строки роли. Одновременно открыта одна форма.
- Блок «Ночью просыпаются» между колодой и таймерами: `nightOrder(registry, check.deck)` → список `<ol className="night-order" aria-label={t('setup.nightOrder')}>` с пунктами «N · название шага» (`stepName` в нижнем регистре), у своих ролей — класс выделения. Пусто — вместо списка строка `setup.nightOrder.none`.
- Колода — список `<ul className="chips" aria-label={t('setup.deck.aria')}>` с пунктами `<li className="chip">`; новый ключ `setup.deck.aria` (таблица задачи 2). Строка над списком (`setup.deck`) остаётся как есть.
- Название в строке роли — с заглавной буквы, как у встроенных (`cap(roleTitle(…))`), в элементе `.role-row-name`; пометка «своя роль» — соседний элемент, не внутри него.
- Длинное название не ломает строку: `overflow-wrap: anywhere` у названия.

- [x] **Step 1: Падающие тесты** — `tests/ui/custom-setup.test.tsx`:

```tsx
const open = async (user: UserEvent) => user.click(screen.getByRole('button', { name: /Добавить свою роль/ }))
const form = () => within(screen.getByRole('form', { name: 'Новая роль' }))

test('добавление роли: строка в перечне, колода, счётчик стороны, порядок ночи', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await open(user)
  await user.type(form().getByLabelText('Название'), 'Журналист')
  await user.click(form().getByRole('radio', { name: 'Красные' }))
  await user.click(form().getByRole('button', { name: 'Добавить роль' }))
  expect(screen.queryByRole('form', { name: 'Новая роль' })).not.toBeInTheDocument()
  expect(app.getState().settings.customRoles).toMatchObject([{ name: 'Журналист', night: true }])
  expect(screen.getByRole('switch', { name: 'Журналист участвует в игре' })).toBeChecked()
  expect(screen.getByText('своя роль')).toBeInTheDocument()
  // Стандартный состав на 10 игроков: чёрных 2, красных 8. Красная роль заняла место мирного — счётчики те же.
  expect(screen.getByText('чёрных 2')).toBeInTheDocument(); expect(screen.getByText('красных 8')).toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Колода' })).getByText('журналист')).toBeInTheDocument()
  // Мафия, крёстный отец, проститутка, шериф, доктор — и шестым шаг своей роли.
  const order = within(screen.getByRole('list', { name: 'Ночью просыпаются' })).getAllByRole('listitem').map((li) => li.textContent)
  expect(order.at(-1)).toBe('6 · журналист')
})
test('Enter в поле названия добавляет роль и не раздаёт карты; Escape закрывает форму', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await open(user); await user.type(form().getByLabelText('Название'), 'Маньяк{Enter}')
  expect(app.getState().screen).toBe('setup'); expect(app.getState().settings.customRoles).toHaveLength(1)
  await open(user); await user.type(form().getByLabelText('Название'), 'черновик{Escape}')
  expect(screen.queryByRole('form', { name: 'Новая роль' })).not.toBeInTheDocument(); expect(app.getState().settings.customRoles).toHaveLength(1)
})
test('ошибки названия показаны строкой, форма остаётся открытой', async () => {
  const { user } = renderApp((a) => a.newGame())
  await open(user); await user.click(form().getByRole('button', { name: 'Добавить роль' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Введите название роли.')
  await user.type(form().getByLabelText('Название'), 'шериф{Enter}')
  expect(screen.getByRole('alert')).toHaveTextContent('Роль с таким названием уже есть.')
})
test('название показывается как текст и не переводится', async () => {
  const { user } = renderApp((a) => { a.newGame(); a.addCustomRole({ name: '<b>жирный</b>', side: a.registry.sides[0]!.id, night: false }) })
  expect(screen.getByText('<b>жирный</b>', { selector: '.role-row-name' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'На главную' })); await user.click(screen.getByRole('button', { name: 'Українська' }))
  await user.click(screen.getByRole('button', { name: /Нова гра/ }))
  expect(screen.getByText('<b>жирный</b>', { selector: '.role-row-name' })).toBeInTheDocument()
  expect(screen.getByText(/уночі спить/)).toBeInTheDocument()
})
test('изменить и удалить', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.addCustomRole({ name: 'Журналист', side: a.registry.sides[1]!.id, night: true }) })
  await user.click(screen.getByRole('button', { name: 'Изменить роль «Журналист»' }))
  const edit = within(screen.getByRole('form', { name: 'Изменить роль' }))
  await user.clear(edit.getByLabelText('Название')); await user.type(edit.getByLabelText('Название'), 'Репортёр')
  await user.click(edit.getByRole('switch', { name: 'Ходит ночью' })); await user.click(edit.getByRole('button', { name: 'Сохранить' }))
  expect(app.getState().settings.customRoles).toMatchObject([{ name: 'Репортёр', night: false }])
  expect(screen.queryByText(/репортёр/, { selector: '.night-order li' })).not.toBeInTheDocument()   // роль больше не ходит ночью
  await user.click(screen.getByRole('button', { name: 'Удалить роль «Репортёр»' }))
  expect(app.getState().settings.customRoles).toEqual([])
})
test('ролей больше, чем игроков, — раздать нельзя; мирных 0 — можно', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.editDraft({ playerCount: 4 }); a.addCustomRole({ name: 'Журналист', side: a.registry.sides[1]!.id, night: true }) })
  expect(screen.getByRole('alert')).toHaveTextContent('ролей на 1 больше, чем игроков')
  expect(screen.getByRole('button', { name: /Раздать роли/ })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Больше игроков' }))
  expect(screen.getByRole('button', { name: /Раздать роли/ })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: /Раздать роли/ }))
  expect(app.getState().screen).toBe('deal'); expect(app.getState().session!.config.customRoles).toHaveLength(1)
})
test('восемь ролей — кнопки добавления нет, есть строка о пределе', () => {
  renderApp((a) => { a.newGame(); for (let i = 0; i < 8; i++) a.addCustomRole({ name: `роль ${i}`, side: a.registry.sides[0]!.id, night: false }) })
  expect(screen.queryByRole('button', { name: /Добавить свою роль/ })).not.toBeInTheDocument()
  expect(screen.getByText('Своих ролей может быть не больше 8.')).toBeInTheDocument()
})
test('«Сбросить к стандарту» выключает свою роль, но оставляет её в перечне', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.addCustomRole({ name: 'Журналист', side: a.registry.sides[1]!.id, night: true }) })
  await user.click(screen.getByRole('button', { name: 'Сбросить к стандарту' }))
  expect(screen.getByRole('switch', { name: 'Журналист участвует в игре' })).not.toBeChecked()
  expect(app.getState().settings.customRoles).toHaveLength(1)
})
```

- [x] **Step 2: Запустить** — FAIL, кнопки «Добавить свою роль» нет.
- [x] **Step 3: Реализовать** форму, строки ролей, блок порядка ночи, стили.
- [x] **Step 4: Запустить** файл — PASS; `npm run check` — PASS.
- [x] **Step 5: Сверить с макетом** — `npm run dev`, экран состава на ширине 1440 и 1024: строка роли, раскрытая форма, блок порядка ночи; длинное название из 24 знаков без пробелов не выталкивает счётчик.
- [x] **Step 6: Commit** — `feat(ui): свои роли на экране состава`.

---

### Task 5: Раздача и ночь

**Files:**
- Modify: `src/ui/game/NightPanel.tsx`, `src/ui/game/nightMarks.ts`, `src/ui/game/NightSummary.tsx`, `src/ui/game/StepNav.tsx`, `src/ui/game/StopDialog.tsx`, `src/ui/screens/DealScreen.tsx`, `src/ui/game/game.css`
- Test: `tests/ui/custom-game.test.tsx`

**Interfaces:**
- Consumes: `seedCustomGame`, `JOURNALIST`, `MANIAC`, `CUSTOM_TABLE` (задачи 1 и 3); `roleTitle`, `stepQuestion` и строки (задача 2).
- Produces: `nightMarks(lang, registry, night, acting?)` — добавился параметр справочника; на карточке цели записи эффекта `note` метка `night.mark.note` с названием роли. Оба вызова (`NightPanel`, `NightSummary`) обновляются.
- `NightPanel`: вопрос — `stepQuestion`; у шага с эффектом `note`, когда запись есть и роли не скрыты, — блок `.answer`: подпись `night.recorded`, крупно «→ №N» или «→ никого», строка `night.custom.note`. Плашка блока берётся по ключу `night.blocked.note` существующим кодом.
- `StepNav`: у шага, чья роль исполнителя помечена `custom`, рядом с названием пометка `role.custom.tag`; при скрытых ролях пометки нет.
- `DealScreen` (`groupName`) и `StopDialog` (`sideRoles`) берут название через `roleTitle`.

- [x] **Step 1: Падающие тесты** — `tests/ui/custom-game.test.tsx`:

```tsx
const seed = (day: number) => (a: AppStore) => seedCustomGame(a, [JOURNALIST, MANIAC], CUSTOM_TABLE, day)
const N1 = { kind: 'night', n: 1 } as const

test('распределение называет свои роли', () => {
  renderApp((a) => { seedCustomGame(a, [JOURNALIST, MANIAC], CUSTOM_TABLE, 0) })   // фаза распределения
  expect(screen.getAllByText('журналист').length).toBeGreaterThan(0); expect(screen.getAllByText('маньяк').length).toBeGreaterThan(0)
})
test('ночной шаг своей роли: вопрос, запись, блок «Записано», метка на карточке, журнал', async () => {
  const { app, user } = renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }) })
  expect(screen.getByText('Кого выбирает журналист?')).toBeInTheDocument()
  expect(within(document.querySelector<HTMLElement>('[data-step="act_custom_j:6"]')!).getByText('своя роль')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ recorded: true, target: 9 })
  expect(screen.getByText('Записано · Журналист')).toBeInTheDocument()
  expect(screen.getByText(/Приложение только записывает выбор/)).toBeInTheDocument()
  expect(screen.getByText('выбор: журналист')).toBeInTheDocument()
  expect(screen.getByText('Журналист → №9')).toBeInTheDocument()
})
test('подсказка итога ночи не зависит от записи своей роли', async () => {
  renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
    a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 6, target: 7 }); a.dispatch({ type: 'enterStep', step: 'summary' }) })
  expect(screen.getByText('№7 застрелен')).toBeInTheDocument()
})
test('блок проститутки показан плашкой; шериф видит чёрную свою роль чёрной', async () => {
  const { user } = renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 6 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }) })
  expect(screen.getByText('заблокирован — действие не состоялось')).toBeInTheDocument()
  await user.click(document.querySelector<HTMLElement>('[data-step="sheriff_check:1"]')!)
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(screen.getByText('№9 — чёрный')).toBeInTheDocument()
})
test('скрытые роли прячут свою роль', async () => {
  renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 6, target: 9 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }); a.setSettings({ rolesHidden: true }) })
  for (const text of ['Записано · Журналист', 'выбор: журналист', 'своя роль', 'Журналист → №9']) expect(screen.queryByText(text)).not.toBeInTheDocument()
})
test('окно остановки и итоги называют свои роли по сторонам', async () => {
  const { user } = renderApp(seed(2))
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('radio', { name: /Чёрные/ })).toHaveTextContent('маньяк')
  expect(dialog.getByRole('radio', { name: /Красные/ })).toHaveTextContent('журналист')
  await user.click(dialog.getByRole('radio', { name: /Красные/ })); await user.click(dialog.getByRole('button', { name: /Завершить/ }))
  expect(screen.getAllByText('журналист').length).toBeGreaterThan(0)
})
```

`seedCustomGame` с `day = 0` оставляет сессию в фазе распределения.

- [x] **Step 2: Запустить** — FAIL: вопрос шага пустой, блока «Записано» нет.
- [x] **Step 3: Реализовать** правки по списку Produces.
- [x] **Step 4: Запустить** файл — PASS; `npm run check` — PASS.
- [x] **Step 5: Сверить с макетом** `NightCustomStep.dc.html` — панель шага своей роли на ширине 1440.
- [x] **Step 6: Commit** — `feat(ui): своя роль в раздаче, ночи, журнале и итогах`.

---

### Task 6: Сценарий, приёмка, документы

**Files:**
- Modify: `tests/scenarios/full-game.test.ts` (новый тест в конце), `scripts/acceptance.mjs`, `docs/acceptance.md`, `README.md`

- [x] **Step 1: Сценарный тест движка** — партия на `CUSTOM_TABLE` из 10 шагов раздела 8 дополнения, которые выражаются командами движка: Ночь 1 (запись журналиста, итог как без неё), Ночь 2 (блок журналиста, проверка маньяка — чёрный), обмен ролей с носителем своей роли, остановка игры, журнал от распределения до конца содержит записи своей роли. Тест падает до задач 1–2 и проходит после них: запустить и убедиться, что проходит.
- [x] **Step 2: Приёмочный сценарий** — в `scripts/acceptance.mjs` шаг 12 «своя роль»: на экране состава добавить «Журналист» (красные, ходит ночью), проверить строку и блок «Ночью просыпаются»; попытка добавить «шериф» даёт ошибку; раздать; на распределении роль названа; дойти до Ночи 1, открыть шаг журналиста, записать выбор, проверить журнал и что подсказка итога не изменилась; обновить страницу — роль и запись на месте. Старые шаги 1–11 не трогать.
- [x] **Step 3: Запустить** — `npm run check`, `npm run build`, `npm run acceptance`. Ожидание: всё проходит, новые проверки шага 12 в списке.
- [x] **Step 4: Документы** — в `docs/acceptance.md` строка шага 12 в таблице и раздел «Свои роли» (что сделано, что не проверено); в `README.md` короткий раздел «Свои роли» для ведущего и поправка в «Как добавить роль» (для встроенной роли — справочник и словари, свою роль ведущий заводит сам).
- [x] **Step 5: Commit** — `docs: приёмка и описание своих ролей`.
