import { screen, within } from '@testing-library/react'
import { createAppStore } from '../../src/app/store'
import { JOURNALIST, MANIAC, testEnv } from '../helpers'
import { renderApp, seedGame } from './helpers'

// Этап 3: новые роли на экране состава, счётчик «сам за себя», победитель-одиночка.

const NEW = ['Охранник', 'Журналист', 'Мясник', 'Маньяк', 'Бронежилет']
const on = (name: string) => screen.getByRole('switch', { name: `${name} участвует в игре` })
/** Игра с мясником (№5): №1 шериф, №3 крёстный отец, №4 доктор, №8 мафия, №10 проститутка. */
const WITH_BUTCHER = 'S c G D butcher c c M c P c'

test('новые роли стоят в перечне выключенными, с пометкой «новая»; выключенная строка серая', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  for (const name of NEW) {
    expect(on(name)).not.toBeChecked()
    const row = on(name).closest('.role-row') as HTMLElement
    expect(row).toHaveAttribute('data-off'); expect(within(row).getByText('новая')).toBeInTheDocument()
  }
  expect((on('Шериф').closest('.role-row') as HTMLElement)).not.toHaveAttribute('data-off')
  expect(screen.queryByText(/сам за себя \d/)).not.toBeInTheDocument()
  await user.click(on('Охранник'))
  expect(app.getState().draft.composition.bodyguard).toBe(1)
  expect(on('Охранник').closest('.role-row') as HTMLElement).not.toHaveAttribute('data-off')
  expect(within(screen.getByRole('list', { name: 'Колода' })).getByText('охранник')).toBeInTheDocument()
})
test('мясника и маньяка не больше одного: счётчик выше 1 не поднимается; одиночки считаются вместе — «сам за себя»', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await user.click(on('Мясник'))
  expect(screen.getByRole('button', { name: 'Мясник: больше' })).toBeDisabled()
  expect(screen.getByText('сам за себя 1')).toBeInTheDocument()
  await user.click(on('Маньяк'))
  expect(screen.getByRole('button', { name: 'Маньяк: больше' })).toBeDisabled()
  expect(screen.getByText('сам за себя 2')).toBeInTheDocument()
  expect(app.getState().draft.composition).toMatchObject({ butcher: 1, maniac: 1 })
  // Обычная роль ограничена только числом игроков.
  await user.click(on('Охранник')); expect(screen.getByRole('button', { name: 'Охранник: больше' })).toBeEnabled()
  // Подпись стороны у одиночки — «сам за себя», а не цвет.
  expect(on('Мясник').closest('.role-row')).toHaveTextContent('сам за себя · ночью убивает любого игрока')
})
test('опции журналиста и маньяка раскрыты под включённой ролью, пишутся в черновик и попадают в игру', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  expect(screen.queryByRole('radiogroup', { name: 'Проверяет' })).not.toBeInTheDocument()
  await user.click(on('Журналист'))
  const pace = within(screen.getByRole('radiogroup', { name: 'Проверяет' }))
  expect(pace.getByRole('radio', { name: 'Каждую ночь' })).toBeChecked()
  expect(screen.getByText(/Сравнивает только закрытые роли, каждого игрока — один раз за игру/)).toBeInTheDocument()
  await user.click(pace.getByRole('radio', { name: 'Через ночь' }))
  expect(app.getState().draft.roleOptions).toMatchObject({ journalist_pace: 'alternate' })

  await user.click(on('Маньяк'))
  const row = within(on('Маньяк').closest('.role-row') as HTMLElement)
  expect(row.getByRole('switch', { name: 'Не ходит к одной жертве две ночи подряд' })).toBeChecked()
  expect(row.getByRole('switch', { name: 'Жертва не выставляет на голосование' })).not.toBeChecked()
  await user.click(row.getByRole('switch', { name: 'Жертва не голосует' }))
  await user.click(row.getByRole('switch', { name: 'Не ходит к одной жертве две ночи подряд' }))
  expect(app.getState().draft.roleOptions).toMatchObject({ maniac_no_vote: true, maniac_no_repeat: false })

  await user.click(screen.getByRole('button', { name: /^Раздать случайно/ }))
  expect(app.getState().session!.config.roleOptions).toEqual({ journalist_pace: 'alternate', maniac_no_vote: true, maniac_no_repeat: false })
  expect(app.getState().session!.config.composition).toMatchObject({ journalist: 1, maniac: 1 })
  expect(app.getState().game!.players.filter((p) => p.roleId === 'maniac')).toHaveLength(1)
})
test('«Сбросить к стандарту» выключает новые роли и возвращает их опции', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.editDraft({ composition: { ...a.getState().draft.composition, maniac: 1, bulletproof: 2 }, roleOptions: { maniac_no_vote: true } }) })
  expect(on('Маньяк')).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Сбросить к стандарту' }))
  for (const name of NEW) expect(on(name)).not.toBeChecked()
  expect(app.getState().draft.roleOptions).toEqual({})
})
test('своя роль «журналист» или «маньяк», заведённая до обновления, остаётся с пометкой «своя роль»; новую с таким названием создать нельзя', async () => {
  const env = testEnv()
  env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'ru', sound: true, rolesHidden: false, lastConfig: null, customRoles: [JOURNALIST, MANIAC] }))
  const app = createAppStore(env); app.newGame()
  expect(app.getState().settings.customRoles).toEqual([JOURNALIST, MANIAC])
  expect(app.registry.roles.filter((r) => r.custom).map((r) => r.name)).toEqual(['журналист', 'маньяк'])
  // Работает как прежде — только запись: у своей роли нет опций и своего действия в расчёте ночи.
  expect(app.registry.nightActions.find((a) => a.performers.includes(JOURNALIST.id))).toMatchObject({ effect: 'note' })
  for (const name of ['Журналист', 'маньяк', 'Мясник', 'різник', 'Охранник', 'охоронець', 'Бронежилет', 'маніяк']) {
    expect(app.addCustomRole({ name, side: 'red', night: true })).toBe('duplicate')
  }
  // Свою прежнюю роль править можно, не меняя названия; чужое встроенное название взять нельзя.
  expect(app.updateCustomRole(JOURNALIST.id, { name: 'Журналист', side: 'black', night: false })).toBeNull()
  expect(app.getState().settings.customRoles[0]).toEqual({ ...JOURNALIST, name: 'Журналист', side: 'black', night: false })
  expect(app.updateCustomRole(JOURNALIST.id, { name: 'Мясник', side: 'black', night: false })).toBe('duplicate')
})
test('на экране состава своя «журналист» и встроенный «Журналист» — две разные строки', async () => {
  const { app } = renderApp((a) => {
    a.setSettings({ customRoles: [JOURNALIST] }); a.newGame()
  })
  const rows = screen.getAllByRole('switch', { name: 'Журналист участвует в игре' }).map((el) => el.closest('.role-row') as HTMLElement)
  expect(rows).toHaveLength(2)
  expect(rows.filter((row) => within(row).queryByText('своя роль') !== null)).toHaveLength(1)
  expect(rows.filter((row) => within(row).queryByText('новая') !== null)).toHaveLength(1)
  expect(app.getState().settings.customRoles).toEqual([JOURNALIST])
})
test('форма своей роли предлагает только чёрных и красных', async () => {
  const { user } = renderApp((a) => a.newGame())
  await user.click(screen.getByRole('button', { name: /Добавить свою роль/ }))
  expect(within(screen.getByRole('form', { name: 'Новая роль' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Чёрные', 'Красные'])
})
test('шапка: одиночки считаются вместе; подсказки о конце игры нет, пока одиночка в игре', async () => {
  const { app } = renderApp((a) => { seedGame(a, WITH_BUTCHER, 1); a.setSettings({ rolesHidden: false }) })
  const counts = () => document.querySelector('.game-counts') as HTMLElement
  expect(counts()).toHaveTextContent('чёрных 3'); expect(counts()).toHaveTextContent('красных 7'); expect(counts()).toHaveTextContent('сам за себя 1')
  for (const seat of [3, 8, 10]) app.dispatch({ type: 'setStatus', seat, status: 'out', cause: 'voted' })
  expect(await screen.findByText('чёрных', { exact: false })).toBeInTheDocument()
  expect(screen.queryByText('Чёрных не осталось')).not.toBeInTheDocument()
  app.dispatch({ type: 'setStatus', seat: 5, status: 'out', cause: 'voted' })
  expect(await screen.findByText('Чёрных не осталось')).toBeInTheDocument(); expect(counts()).toHaveTextContent('сам за себя 0')
})
test('в игре без одиночек счётчика «сам за себя» и победителя-одиночки нет', async () => {
  const { user } = renderApp((a) => { seedGame(a, 'S c G D c c c M c P c', 1); a.setSettings({ rolesHidden: false }) })
  expect(document.querySelector('.game-counts')).not.toHaveTextContent('сам за себя')
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  expect(within(screen.getByRole('dialog')).getAllByRole('radio').map((r) => r.textContent)).toHaveLength(3)
})
test('окно остановки предлагает победителем одиночку, роль которого есть в игре; итоги называют его победу', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, WITH_BUTCHER, 1); a.setSettings({ rolesHidden: false }) })
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  const dialog = within(screen.getByRole('dialog'))
  // Маньяка в игре нет — его в списке нет.
  expect(dialog.getAllByRole('radio').map((r) => r.textContent!.replace(/сам за себя.*/, ''))).toEqual(
    [expect.stringMatching(/^Чёрные/), expect.stringMatching(/^Красные/), 'Мясник', expect.stringMatching(/^Без победителя/)])
  expect(dialog.getByRole('radio', { name: /Мясник/ })).toHaveTextContent('сам за себя · в игре 1')
  await user.click(dialog.getByRole('radio', { name: /Мясник/ })); await user.click(dialog.getByRole('button', { name: 'Завершить: победа мясника' }))
  expect(app.getState().game!.finished).toEqual({ winner: 'solo_butcher' })
  expect(screen.getByText('Победа мясника')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'На главную' }))
  expect(screen.getByText('Победа мясника')).toBeInTheDocument()
})
test('новые роли и «сам за себя» подписаны по-украински', async () => {
  const { user } = renderApp((a) => { a.setSettings({ lang: 'uk' }); a.newGame() })
  for (const name of ['Охоронець', 'Журналіст', 'Різник', 'Маніяк', 'Бронежилет']) expect(screen.getByRole('switch', { name: `${name} бере участь у грі` })).toBeInTheDocument()
  await user.click(screen.getByRole('switch', { name: 'Різник бере участь у грі' }))
  expect(screen.getByText('сам за себе 1')).toBeInTheDocument()
})
