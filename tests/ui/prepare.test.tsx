import { screen, within } from '@testing-library/react'
import { DEFAULT_RULES } from '../../src/engine'
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
