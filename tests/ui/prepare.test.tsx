import { screen, within } from '@testing-library/react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAppStore } from '../../src/app/store'
import { DEFAULT_REGISTRY, DEFAULT_RULES } from '../../src/engine'
import type { Registry } from '../../src/engine'
import { App } from '../../src/ui/App'
import { testEnv } from '../helpers'
import { advance, renderApp } from './helpers'

test('от главной до Дня 1', async () => {
  const { app, user, env } = renderApp()
  await user.click(screen.getByRole('button', { name: 'Новая игра' }))
  await user.click(screen.getByRole('button', { name: 'Больше игроков' }))
  await user.click(screen.getByRole('button', { name: 'Мафия: больше' }))
  expect(screen.getByText('из них крёстный отец: 1', { exact: false })).toBeInTheDocument()
  expect(screen.getByText('чёрных 3', { exact: false })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Раздать роли/ }))
  expect(app.getState().screen).toBe('deal'); expect(app.getState().game!.players.filter((p) => p.side === 'black')).toHaveLength(3)
  expect(screen.getAllByText(/глава/).length).toBeGreaterThan(0)
  advance(env, 500)   // главная кнопка не реагирует 0,4 с после появления экрана (задача 14)
  await user.click(screen.getByRole('button', { name: /Город просыпается: День 1/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 1 })
})
test('ролей больше, чем игроков: раздать нельзя, причина видна', async () => {
  renderApp((app) => { app.newGame(); app.editDraft({ playerCount: 4, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 } }) })
  expect(screen.getByRole('button', { name: /Раздать роли/ })).toBeDisabled()
  expect(screen.getByText(/ролей на 1 больше, чем игроков/)).toBeInTheDocument()
})
test('перераздать и удалить игру — только через подтверждение', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.dealDraft() })
  await user.click(screen.getByRole('button', { name: 'Перераздать' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }))
  expect(app.getState().session!.log.filter((e) => e.type === 'roles_dealt')).toHaveLength(1)
  const dealt = app.getState().session!.log.find((e) => e.type === 'roles_dealt')!.id
  await user.click(screen.getByRole('button', { name: 'Перераздать' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Перераздать роли' }))
  expect(app.getState().session!.log.find((e) => e.type === 'roles_dealt')!.id).not.toBe(dealt)
  const id = app.getState().session!.id
  await user.click(screen.getByRole('button', { name: 'Назад к составу' })); await user.click(screen.getByRole('button', { name: 'На главную' }))
  expect(app.getState().sessions).toEqual([])
  app.openSession(id); expect(app.getState().session).toBeNull()
})
test('удаление игры с главной — через окно подтверждения', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.dealDraft(); a.goHome() })
  await user.click(screen.getByRole('button', { name: 'Удалить' }))
  expect(app.getState().sessions).toHaveLength(1)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить игру' }))
  expect(app.getState().sessions).toEqual([])
})
test('язык переключается и запоминается', async () => {
  const { app, user } = renderApp()
  await user.click(screen.getByRole('button', { name: 'Українська' }))
  expect(screen.getByRole('button', { name: 'Нова гра' })).toBeInTheDocument(); expect(app.getState().settings.lang).toBe('uk')
})
test('поменять роли двум номерам на экране распределения', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.dealDraft() })
  const before = app.getState().game!.players.map((p) => p.roleId)
  await user.click(screen.getByRole('button', { name: 'Поменять роли двум номерам' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №1' })); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №10' }))
  const after = app.getState().game!.players.map((p) => p.roleId)
  expect(after[0]).toBe(before[9]); expect(after[9]).toBe(before[0])
})

// ── Правила партии на экране состава ────────────────────────────────────────

const rulesBlock = () => within(screen.getByRole('region', { name: 'Правила партии' }))

test('блок «Правила партии»: умолчания новой игры видны выключателями и выбором', async () => {
  const { app } = renderApp((a) => a.newGame())
  expect(app.getState().draft.rules).toEqual(DEFAULT_RULES)
  expect(rulesBlock().getByRole('switch', { name: 'Балаган перед кругом речей' })).toBeChecked()
  expect(rulesBlock().getByRole('switch', { name: 'Прощание после голосования' })).toBeChecked()
  expect(rulesBlock().getByRole('switch', { name: 'Прощание после ночной смерти' })).not.toBeChecked()
  const order = within(rulesBlock().getByRole('radiogroup', { name: 'Проститутка просыпается' }))
  expect(order.getByRole('radio', { name: 'Первой' })).toBeChecked(); expect(order.getByRole('radio', { name: 'После мафии' })).not.toBeChecked()
})
test('выключатели и выбор меняют правила черновика, раздача кладёт их в игру', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await user.click(rulesBlock().getByRole('switch', { name: 'Балаган перед кругом речей' }))
  expect(app.getState().draft.rules).toEqual({ ...DEFAULT_RULES, balagan: false })
  await user.click(rulesBlock().getByRole('switch', { name: 'Прощание после голосования' }))
  await user.click(rulesBlock().getByRole('switch', { name: 'Прощание после ночной смерти' }))
  await user.click(rulesBlock().getByRole('radio', { name: 'После мафии' }))
  const chosen = { ...DEFAULT_RULES, balagan: false, farewellAfterVote: false, farewellAfterNight: true, prostituteFirst: false }
  expect(app.getState().draft.rules).toEqual(chosen)
  expect(rulesBlock().getByRole('radio', { name: 'После мафии' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: /Раздать роли/ }))
  expect(app.getState().session!.config.rules).toEqual(chosen)
  // Следующая игра начинается с тех же правил: последний состав запоминается целиком.
  app.goHome(); app.newGame()
  expect(app.getState().draft.rules).toEqual(chosen)
})
test('«Сбросить к стандарту» возвращает правила партии к умолчаниям', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.editDraft({ rules: { ...DEFAULT_RULES, balagan: false, farewellAfterNight: true, prostituteFirst: false } }) })
  expect(rulesBlock().getByRole('switch', { name: 'Балаган перед кругом речей' })).not.toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Сбросить к стандарту' }))
  expect(app.getState().draft.rules).toEqual(DEFAULT_RULES)
  expect(rulesBlock().getByRole('switch', { name: 'Балаган перед кругом речей' })).toBeChecked()
  expect(rulesBlock().getByRole('radio', { name: 'Первой' })).toBeChecked()
})
test('правила партии подписаны по-украински', async () => {
  renderApp((a) => { a.setSettings({ lang: 'uk' }); a.newGame() })
  const block = within(screen.getByRole('region', { name: 'Правила партії' }))
  for (const name of ['Балаган перед колом промов', 'Прощання після голосування', 'Прощання після нічної смерті']) {
    expect(block.getByRole('switch', { name })).toBeInTheDocument()
  }
  const order = within(block.getByRole('radiogroup', { name: 'Повія прокидається' }))
  expect(order.getByRole('radio', { name: 'Першою' })).toBeChecked(); expect(order.getByRole('radio', { name: 'Після мафії' })).toBeInTheDocument()
})

// ── Опции ролей на экране состава ───────────────────────────────────────────

const LATE = /Проститутка просыпается после мафии: ответ на поиск к этому моменту уже показан/
const blockOption = () => screen.queryByRole('radiogroup', { name: 'Блок крёстного отца отменяет' })

test('опция проститутки видна под её строкой, пока роль включена; по умолчанию блок отменяет выстрел', async () => {
  const { user } = renderApp((a) => a.newGame())
  expect(within(blockOption()!).getByRole('radio', { name: 'Выстрел' })).toBeChecked()
  expect(within(blockOption()!).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Выстрел', 'Поиск шерифа', 'Выстрел и поиск'])
  // Опция лежит внутри строки своей роли.
  expect(blockOption()!.closest('.role-row')).toContainElement(screen.getByRole('switch', { name: 'Проститутка участвует в игре' }))
  await user.click(screen.getByRole('switch', { name: 'Проститутка участвует в игре' }))
  expect(blockOption()).not.toBeInTheDocument()
  await user.click(screen.getByRole('switch', { name: 'Проститутка участвует в игре' }))
  expect(blockOption()).toBeInTheDocument()
})
test('выбор опции пишется в черновик и попадает в игру при раздаче', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await user.click(within(blockOption()!).getByRole('radio', { name: 'Выстрел и поиск' }))
  expect(app.getState().draft.roleOptions).toEqual({ leader_block: 'both' })
  expect(within(blockOption()!).getByRole('radio', { name: 'Выстрел и поиск' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: /Раздать роли/ }))
  expect(app.getState().session!.config.roleOptions).toEqual({ leader_block: 'both' })
})
test('отмена поиска при проститутке «после мафии» — предупреждение под опцией; появляется и исчезает', async () => {
  const { user } = renderApp((a) => a.newGame())
  await user.click(within(blockOption()!).getByRole('radio', { name: 'Поиск шерифа' }))
  expect(screen.queryByText(LATE)).not.toBeInTheDocument()                    // проститутка первой — предупреждать не о чем
  await user.click(screen.getByRole('radio', { name: 'После мафии' }))
  expect(within(blockOption()!.closest('.role-row') as HTMLElement).getByText(LATE)).toBeInTheDocument()
  await user.click(within(blockOption()!).getByRole('radio', { name: 'Выстрел' }))
  expect(screen.queryByText(LATE)).not.toBeInTheDocument()
  await user.click(within(blockOption()!).getByRole('radio', { name: 'Выстрел и поиск' }))
  expect(screen.getByText(LATE)).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: 'Первой' }))
  expect(screen.queryByText(LATE)).not.toBeInTheDocument()
  // Предупреждение — не запрет: раздать можно.
  await user.click(screen.getByRole('radio', { name: 'После мафии' }))
  expect(screen.getByRole('button', { name: /Раздать роли/ })).toBeEnabled()
})
test('«Сбросить к стандарту» возвращает опцию роли к умолчанию', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.editDraft({ roleOptions: { leader_block: 'search' } }) })
  expect(within(blockOption()!).getByRole('radio', { name: 'Поиск шерифа' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Сбросить к стандарту' }))
  expect(app.getState().draft.roleOptions ?? {}).toEqual({})
  expect(within(blockOption()!).getByRole('radio', { name: 'Выстрел' })).toBeChecked()
})
test('блок «Ночью просыпаются» показывает проститутку первой — или после мафии, по правилу партии', async () => {
  const { user } = renderApp((a) => a.newGame())
  const order = () => within(screen.getByRole('list', { name: 'Ночью просыпаются' })).getAllByRole('listitem').map((li) => li.textContent)
  expect(order()).toEqual(['1 · проститутка', '2 · мафия', '3 · крёстный отец', '4 · шериф', '5 · доктор'])
  await user.click(screen.getByRole('radio', { name: 'После мафии' }))
  expect(order()).toEqual(['1 · мафия', '2 · крёстный отец', '3 · проститутка', '4 · шериф', '5 · доктор'])
})
test('опции рисуются по описанию из справочника: выключатель у любой роли, без знания о ролях в коде экрана', async () => {
  // Справочник с придуманной опцией-выключателем у доктора: экран ничего о ней не знает.
  const registry: Registry = {
    ...DEFAULT_REGISTRY,
    roles: DEFAULT_REGISTRY.roles.map((r) => (r.id === 'doctor' ? { ...r, options: [{ id: 'made_up', kind: 'toggle' as const, default: true, labelKey: 'Придуманная опция' }] } : r)),
  }
  const app = createAppStore({ ...testEnv(), registry }); app.newGame()
  const user = userEvent.setup(); render(<App store={app} />)
  const toggle = screen.getByRole('switch', { name: 'Придуманная опция' })
  expect(toggle).toBeChecked(); expect(toggle.closest('.role-row')).toContainElement(screen.getByRole('switch', { name: 'Доктор участвует в игре' }))
  await user.click(toggle)
  expect(app.getState().draft.roleOptions).toEqual({ made_up: false }); expect(screen.getByRole('switch', { name: 'Придуманная опция' })).not.toBeChecked()
})
