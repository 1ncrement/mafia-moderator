import { act, screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from './helpers'

const day2 = (app: AppStore) => seedGame(app, TABLE_11, 2)
test('шапка и стол', () => {
  renderApp(day2)
  const header = within(screen.getByRole('banner'))
  expect(header.getByText('День 2')).toBeInTheDocument(); expect(header.getByText('11 из 11')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^Игрок №/ })).toHaveLength(11)
  expect(within(screen.getByRole('button', { name: 'Игрок №3' })).getByText(/мафия · глава/)).toBeInTheDocument()
})
test('статус с карточки и отмена', async () => {
  const { app, user } = renderApp(day2)
  await user.click(screen.getByRole('button', { name: 'Игрок №9' }))
  await user.click(screen.getByRole('button', { name: 'Застрелен' }))
  expect(app.getState().game!.players[8]!.status).toBe('out'); expect(screen.getByText('10 из 11')).toBeInTheDocument()
  expect(within(screen.getByRole('button', { name: 'Игрок №9' })).getByText(/застрелен · День 2/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Отменить' }))
  expect(app.getState().game!.players[8]!.status).toBe('alive')
})
test('скрытие ролей прячет роли, счётчики сторон и журнал', async () => {
  const { user } = renderApp(day2)
  await user.click(screen.getByRole('button', { name: 'Скрыть роли' }))
  expect(screen.queryByText(/мафия/)).not.toBeInTheDocument(); expect(screen.queryByText(/чёрных/)).not.toBeInTheDocument()
  expect(screen.getByText(/Журнал скрыт/)).toBeInTheDocument()
})
test('пауза закрывает экран и не запускает таймер при снятии', async () => {
  const { app, user } = renderApp((a) => { day2(a); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) })
  await user.click(screen.getByRole('button', { name: 'Пауза игры' }))
  expect(screen.queryByRole('button', { name: 'Игрок №3' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Продолжить игру' }))
  expect(app.getState().session!.timer!.status).toBe('paused')
})
test('стол на 20 игроков — пять колонок', () => {
  renderApp((a) => seedGame(a, 'G M P S D c c c c c c c c c c c c c c c', 1))
  expect(screen.getByRole('list', { name: 'Игровой стол' })).toHaveAttribute('data-columns', '5')
})
test('предупреждение о недоступном хранилище', () => {
  const { app, env } = renderApp(day2); env.kv.failWrites = true
  act(() => { app.dispatch({ type: 'setStatus', seat: 2, status: 'out', cause: 'voted' }) })
  expect(screen.getByText(/Сохранение недоступно/)).toBeInTheDocument()
})

// Сверх плана
test('панель игрока: обмен ролями и записи журнала с этим номером', async () => {
  const { app, user } = renderApp((a) => { day2(a); a.dispatch({ type: 'nominate', by: 5, target: 9 }) })
  await user.click(screen.getByRole('button', { name: 'Игрок №9' }))
  const panel = within(screen.getByRole('group', { name: 'Игрок №9' }))
  expect(panel.getByText('1. №5 выставил №9')).toBeInTheDocument()
  await user.click(panel.getByRole('button', { name: 'Поменять роль с…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №1' }))
  expect(app.getState().game!.players[8]!.roleId).toBe('sheriff')
})
test('журнал: текущая фаза раскрыта, прошлые свёрнуты в резюме и раскрываются', async () => {
  const { user } = renderApp((a) => { day2(a); a.dispatch({ type: 'openCircle', first: 5 }) })
  const journal = within(screen.getByRole('complementary', { name: 'Журнал' }))
  expect(journal.getByText('Круг начал №5')).toBeInTheDocument()
  expect(journal.queryByText(/Роли розданы:/)).not.toBeInTheDocument()
  await user.click(journal.getByRole('button', { name: /^Распределение/ }))
  expect(journal.getByText(/Роли розданы: мафия 2/)).toBeInTheDocument()
})
test('подсказка о конце игры и меню: язык и выход на главную', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, 'G M c c', 1) })
  expect(screen.getByText(/Чёрных не меньше/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Українська' }))
  expect(within(screen.getByRole('banner')).getByText('День 1')).toBeInTheDocument(); expect(app.getState().settings.lang).toBe('uk')
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'На головну' }))
  expect(app.getState().screen).toBe('home')
})
