import { act, screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { DEFAULT_REGISTRY } from '../../src/engine'
import { CUSTOM_TABLE, JOURNALIST, MANIAC, TABLE_11 } from '../helpers'
import { advance, renderApp, seedCustomGame, seedGame } from './helpers'

const night1 = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }) }
/** Ночь 1, открыт шаг мафии: в новой игре ночь начинается с проститутки, а этим тестам нужен выстрел. */
const mafiaStep = (a: AppStore) => { night1(a); a.dispatch({ type: 'enterStep', step: 'mafia_shot' }) }
test('шаги ночи по порядку (проститутка первой), крёстный отец получает ответ', async () => {
  const { app, user, env } = renderApp(night1)
  expect(within(screen.getByRole('navigation', { name: 'Шаги ночи' })).getAllByRole('button').map((b) => b.getAttribute('data-step')))
    .toEqual(['prostitute_block:10', 'mafia_shot', 'godfather_search:3', 'sheriff_check:1', 'doctor_heal:4', 'summary'])
  expect(screen.getByText('Кого блокирует проститутка?')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №6' }))
  await user.click(screen.getByRole('button', { name: /Дальше: Мафия/ }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №6' }))
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Дальше: Крёстный отец/ }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №1' }))
  expect(screen.getByText('№1 — шериф')).toBeInTheDocument()
  expect(app.getState().game!.night!.steps[2]).toMatchObject({ target: 1, answer: { kind: 'found', found: true } })
})
test('шериф видит сторону', async () => {
  const { user } = renderApp((a) => { night1(a); a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' }) })
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №10' })); expect(screen.getByText('№10 — чёрный')).toBeInTheDocument()
})
test('заблокированному шерифу ответа нет', async () => {
  const { user } = renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 1 }); a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' }) })
  expect(screen.getByText('Проверка этой ночью не состоится.', { exact: false })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №8' }))
  expect(document.querySelector('.answer')).toBeNull()
})
test('доктор: прошлая ночь, предупреждение и «Записать всё равно»', async () => {
  const { app, user } = renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 5 })
    a.dispatch({ type: 'confirmNight', chosen: null }); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: 'doctor_heal:4' }) })
  expect(screen.getByText(/Прошлой ночью: №5/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' }))
  expect(screen.getByText('Этого игрока лечили прошлой ночью')).toBeInTheDocument(); expect(app.getState().game!.night!.steps.at(-1)!.recorded).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Записать всё равно' })); expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ target: 5 })
})
test('серый шаг выбывшей роли', async () => {
  renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'setStatus', seat: 1, status: 'out', cause: 'voted' })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }); a.dispatch({ type: 'enterStep', step: 'sheriff_check' }) })
  expect(screen.getAllByText(/выбыл · разбудить для вида/).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Выбрать игрока №2' })).not.toBeInTheDocument()
})
test('итог ночи: подсказка, подтверждение одной кнопкой, другой исход', async () => {
  const seed = (a: AppStore) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 6 }); a.dispatch({ type: 'enterStep', step: 'summary' }) }
  const first = renderApp(seed)
  expect(screen.getByText('№6 застрелен')).toBeInTheDocument(); expect(screen.getByText(/Не записано:/)).toBeInTheDocument()
  await first.user.click(screen.getByRole('button', { name: /№6 застрелен · начать День 2/ }))
  expect(first.app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(first.app.getState().game!.players[5]!.status).toBe('out')
  first.unmount()
  const second = renderApp(seed)
  await second.user.click(screen.getByRole('button', { name: 'Никто не выбыл' }))
  expect(second.app.getState().game!.counts.alive).toBe(11)
})

// Сверх плана
test('ночь целиком: «Никого», ночные метки на столе, подсказки итога', async () => {
  const { app, user, env } = renderApp(night1)
  // Ночь начинается с проститутки: она никого не блокирует.
  await user.click(screen.getByRole('button', { name: 'Никого' }))
  expect(app.getState().game!.night!.steps[0]).toMatchObject({ actionId: 'prostitute_block', recorded: true, target: null })
  await user.click(screen.getByRole('button', { name: /Дальше: Мафия/ })); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  for (const step of ['Крёстный отец', 'Шериф', 'Доктор']) { advance(env, 500); await user.click(screen.getByRole('button', { name: new RegExp(`Дальше: ${step}`) })) }
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(within(screen.getByRole('button', { name: 'Выбрать игрока №7' })).getByText('цель мафии')).toBeInTheDocument()
  advance(env, 500); await user.click(within(screen.getByRole('navigation', { name: 'Шаги ночи' })).getByRole('button', { name: 'Итог ночи' }))
  expect(app.getState().game!.step).toBe('summary')
  expect(screen.getByText('Никто не выбыл: доктор вылечил №7')).toBeInTheDocument(); expect(screen.getByText('Не записано: Крёстный отец, Шериф')).toBeInTheDocument()
  expect(within(screen.getByRole('button', { name: 'Игрок №7' })).getByText('вылечен')).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Никто не выбыл · начать День 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(app.getState().game!.counts.alive).toBe(11)
  expect(within(screen.getByRole('button', { name: 'Игрок №7' })).queryByText('вылечен')).not.toBeInTheDocument()
})
test('блок крёстного отца: «выстрела не было»; выбыл другой', async () => {
  const { app, user } = renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 5 })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 3 }); a.dispatch({ type: 'enterStep', step: 'summary' }) })
  expect(screen.getByText('Никто не выбыл: выстрела не было')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбыл другой…' })); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №2' }))
  expect(app.getState().game!.players[1]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } })
})
test('выстрел перешёл к проститутке: вопрос называет её', () => {
  renderApp((a) => { seedGame(a, TABLE_11, 1); for (const seat of [3, 8]) a.dispatch({ type: 'setStatus', seat, status: 'out', cause: 'voted' })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }); a.dispatch({ type: 'enterStep', step: 'mafia_shot' }) })
  expect(screen.getByText('В кого стреляет проститутка?')).toBeInTheDocument(); expect(screen.getByText(/Просыпается проститутка — №10/)).toBeInTheDocument()
})

test('скрытие ролей ночью прячет номера ролей, записанный выбор, ночные метки и итог', () => {
  const { app } = renderApp((a) => { mafiaStep(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 6 }); a.setSettings({ rolesHidden: true }) })
  expect(screen.getByText('Просыпается мафия')).toBeInTheDocument()
  expect(screen.queryByText(/№3|№8|№6/)).not.toBeInTheDocument()
  expect(screen.queryByText(/цель мафии|выбран|ходит сейчас/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Выбрать игрока №6' })).not.toHaveClass('card-picked')
  act(() => { app.dispatch({ type: 'setStatus', seat: 1, status: 'out', cause: 'voted', phase: { kind: 'day', n: 1 } }) })
  expect(screen.queryByText(/разбудить для вида/)).not.toBeInTheDocument()
  act(() => { app.dispatch({ type: 'enterStep', step: 'summary' }) })
  expect(screen.queryByText(/застрелен/)).not.toBeInTheDocument(); expect(screen.getByText(/скрыты вместе с ролями/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Подтвердить итог · начать День 2/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Никто не выбыл' })).not.toBeInTheDocument()
})

test('ночной выбор возвращается после отменённого вопроса из панели игрока', async () => {
  const { user } = renderApp(mafiaStep)
  await user.click(screen.getByRole('button', { name: 'Панель игрока №5' })); await user.click(screen.getByRole('button', { name: 'Поменять роль с…' }))
  expect(screen.getByText('С кем поменять роль №5?')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(screen.getByText('В кого стреляет мафия?')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Никого' })).toBeInTheDocument()
})
test('ночью возвращённый в игру сразу доступен как цель', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'setStatus', seat: 7, status: 'out', cause: 'voted' }); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }) })
  expect(screen.queryByRole('button', { name: 'Выбрать игрока №7' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Панель игрока №7' })); await user.click(screen.getByRole('button', { name: 'Вернуть в игру' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(app.getState().game!.night!.steps[0]).toMatchObject({ recorded: true, target: 7 })
})

// ── Блок проститутки на шаге заблокированной роли ───────────────────────────

const OPTION_ID = DEFAULT_REGISTRY.roles.flatMap((r) => r.options ?? [])[0]!.id
/** Ночь 1, проститутка (№10) блокирует target, открыт шаг step. */
const blockedNight = (target: number, step: string, roleOptions?: Record<string, string>) => (a: AppStore) => {
  seedGame(a, TABLE_11, 1, roleOptions ? { roleOptions } : undefined); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target }); a.dispatch({ type: 'enterStep', step })
}
const blockBox = () => screen.queryByRole('alert')
const navStep = (id: string) => document.querySelector<HTMLElement>(`[data-step="${id}"]`)!
const card = (n: number) => document.querySelectorAll<HTMLElement>('.table-grid .card')[n - 1]!

test('шериф заблокирован: красный блок с номером и текстом, пометка в полосе шагов, красная метка на карточке', () => {
  renderApp(blockedNight(1, 'sheriff_check:1'))
  const box = within(blockBox()!)
  expect(box.getByText('Блок проститутки')).toBeInTheDocument(); expect(box.getByText('№1 заблокирован')).toBeInTheDocument()
  expect(box.getByText('Покажи игроку, что он заблокирован. Проверка этой ночью не состоится.')).toBeInTheDocument()
  expect(screen.getByText('Выбор записать можно, ответа на него не будет.')).toBeInTheDocument()
  expect(navStep('sheriff_check:1')).toHaveAttribute('data-blocked'); expect(within(navStep('sheriff_check:1')).getByText('заблокирован')).toBeInTheDocument()
  expect(navStep('doctor_heal:4')).not.toHaveAttribute('data-blocked')
  expect(card(1)).toHaveClass('card-blocked'); expect(within(card(1)).getByText('заблокирован')).toHaveClass('card-mark-block')
  expect(card(4)).not.toHaveClass('card-blocked')
})
test('доктор заблокирован: «лечение не сработает»; своя роль: «действие не состоится»', () => {
  const doctor = renderApp(blockedNight(4, 'doctor_heal:4'))
  expect(within(blockBox()!).getByText('№4 заблокирован')).toBeInTheDocument()
  expect(within(blockBox()!).getByText('Покажи игроку, что он заблокирован. Лечение этой ночью не сработает.')).toBeInTheDocument()
  expect(screen.getByText('Выбор записать можно, но он не сработает.')).toBeInTheDocument()
  doctor.unmount()
  renderApp((a) => { seedCustomGame(a, [JOURNALIST, MANIAC], CUSTOM_TABLE, 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 6 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }) })
  expect(within(blockBox()!).getByText('№6 заблокирован')).toBeInTheDocument()
  expect(within(blockBox()!).getByText('Покажи игроку, что он заблокирован. Действие этой ночью не состоится.')).toBeInTheDocument()
})
test('крёстный отец заблокирован: на шагах мафии и крёстного отца показано то, что отменяет опция проститутки', async () => {
  const NO_SHOT = 'Выстрела этой ночью не будет.', SHOT_OK = 'На выстрел это не влияет.'
  const NO_SEARCH = 'Поиск шерифа этой ночью не состоится.', SEARCH_OK = 'На поиск шерифа это не влияет.'
  for (const [value, onMafia, onSearch] of [['shot', NO_SHOT, SEARCH_OK], ['search', SHOT_OK, NO_SEARCH], ['both', NO_SHOT, NO_SEARCH]] as const) {
    const { user, unmount } = renderApp(blockedNight(3, 'mafia_shot', { [OPTION_ID]: value }))
    expect(within(blockBox()!).getByText('№3 заблокирован')).toBeInTheDocument()
    expect(within(blockBox()!).getByText(`Покажи игроку, что он заблокирован. ${onMafia}`)).toBeInTheDocument()
    // Пометка «заблокирован» в полосе шагов — только у шага, действие которого блок отменил.
    expect(navStep('mafia_shot').hasAttribute('data-blocked')).toBe(onMafia === NO_SHOT)
    expect(navStep('godfather_search:3').hasAttribute('data-blocked')).toBe(onSearch === NO_SEARCH)
    await user.click(navStep('godfather_search:3'))
    expect(within(blockBox()!).getByText(`Покажи игроку, что он заблокирован. ${onSearch}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Выбрать игрока №1' }))
    // Поиск не отменён — ответ показан; отменён — ответа нет.
    expect(screen.queryByText('№1 — шериф') !== null).toBe(onSearch === SEARCH_OK)
    unmount()
  }
})
test('рядовая мафия заблокирована при живом крёстном отце: блок показан, «на выстрел не влияет»', () => {
  renderApp(blockedNight(8, 'mafia_shot'))
  expect(within(blockBox()!).getByText('№8 заблокирован')).toBeInTheDocument()
  expect(within(blockBox()!).getByText('Покажи игроку, что он заблокирован. На выстрел это не влияет.')).toBeInTheDocument()
  expect(navStep('mafia_shot')).not.toHaveAttribute('data-blocked')
  expect(screen.queryByText(/Выбор записать можно/)).not.toBeInTheDocument()
  expect(card(8)).toHaveClass('card-blocked')
})
test('блок виден и при скрытых ролях — без номера исполнителя и без метки на карточке: роль он не выдаёт', () => {
  renderApp((a) => { blockedNight(1, 'sheriff_check:1')(a); a.setSettings({ rolesHidden: true }) })
  const box = within(blockBox()!)
  expect(box.getByText('Блок проститутки')).toBeInTheDocument(); expect(box.getByText('Исполнитель заблокирован')).toBeInTheDocument()
  expect(box.getByText('Покажи игроку, что он заблокирован. Проверка этой ночью не состоится.')).toBeInTheDocument()
  expect(within(navStep('sheriff_check:1')).getByText('заблокирован')).toBeInTheDocument()
  // Ни блок, ни панель шага, ни стол не называют, кто именно заблокирован: по шагу «Шериф» это выдало бы роль.
  expect(blockBox()!.textContent).not.toMatch(/№\s*1/); expect(screen.getByRole('region', { name: 'Текущий шаг' }).textContent).not.toMatch(/№\s*\d/)
  expect(card(1)).not.toHaveClass('card-blocked'); expect(within(card(1)).queryByText('заблокирован')).not.toBeInTheDocument()
})
test('итог ночи: строка «Заблокированы: №… — покажи игроку» — про тех, у кого есть ночной шаг', () => {
  const sheriff = renderApp(blockedNight(1, 'summary'))
  expect(screen.getByText('Заблокированы: №1 — покажи игроку')).toBeInTheDocument()
  sheriff.unmount()
  // Заблокирован мирный житель: ночью он не просыпается — показывать блок некому.
  const civilian = renderApp(blockedNight(5, 'summary'))
  expect(screen.queryByText(/Заблокированы:/)).not.toBeInTheDocument(); expect(card(5)).toHaveClass('card-blocked')
  civilian.unmount()
  // Роли скрыты — номеров на итоге нет.
  renderApp((a) => { blockedNight(1, 'summary')(a); a.setSettings({ rolesHidden: true }) })
  expect(screen.queryByText(/Заблокированы:/)).not.toBeInTheDocument()
})
test('без блока ничего красного нет: ни блока, ни пометки шага, ни метки на карточке, ни строки на итоге', async () => {
  const { user } = renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 }); a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' }) })
  const clean = () => {
    expect(blockBox()).not.toBeInTheDocument(); expect(document.querySelector('[data-blocked]')).toBeNull()
    expect(document.querySelector('.card-blocked, .card-mark-block')).toBeNull(); expect(screen.queryByText(/заблокирован/i)).not.toBeInTheDocument()
  }
  clean()
  await user.click(navStep('mafia_shot')); clean()
  await user.click(navStep('summary')); clean()
})
test('проститутка после мафии: блок появляется на уже пройденном шаге, когда она сделала выбор', async () => {
  const { user } = renderApp((a) => { seedGame(a, TABLE_11, 1, { rules: { nominationsFromDay: 2, balaganFromDay: 2, balagan: true, farewellAfterVote: true, farewellAfterNight: false, prostituteFirst: false } })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }) })
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(navStep('mafia_shot')).not.toHaveAttribute('data-blocked')
  await user.click(navStep('prostitute_block:10')); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №3' }))
  expect(navStep('mafia_shot')).toHaveAttribute('data-blocked')
  await user.click(navStep('mafia_shot')); expect(within(blockBox()!).getByText('№3 заблокирован')).toBeInTheDocument()
})

test('две проститутки заблокировали крёстного отца и мафию: блок называет обоих во множественном числе', () => {
  // №9 и №10 — проститутки: первая блокирует №3 (крёстный отец), вторая — №8 (мафия).
  renderApp((a) => { seedGame(a, 'S c G D c c c M P P c', 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 9, target: 3 })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 8 }); a.dispatch({ type: 'enterStep', step: 'mafia_shot' }) })
  expect(within(blockBox()!).getByText('№3 и №8 заблокированы')).toBeInTheDocument()
  expect(within(blockBox()!).getByText('Покажи игрокам, что они заблокированы. Выстрела этой ночью не будет.')).toBeInTheDocument()
  expect(card(3)).toHaveClass('card-blocked'); expect(card(8)).toHaveClass('card-blocked')
})
test('итог ночи называет всех заблокированных исполнителей по возрастанию номеров', () => {
  renderApp((a) => { seedGame(a, 'S c G D c c c M P P c', 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 9, target: 4 })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 1 }); a.dispatch({ type: 'enterStep', step: 'summary' }) })
  expect(screen.getByText('Заблокированы: №1 и №4 — покажи игрокам')).toBeInTheDocument()
})
