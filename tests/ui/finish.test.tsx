import { screen, within } from '@testing-library/react'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from './helpers'

test('остановка: выбор стороны, итоги, возобновление', async () => {
  const { app, user } = renderApp((a) => seedGame(a, TABLE_11, 2))
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('button', { name: /^Завершить/ })).toBeDisabled()
  await user.click(dialog.getByRole('radio', { name: /Чёрные/ })); await user.click(dialog.getByRole('button', { name: 'Завершить: победа чёрных' }))
  expect(app.getState().screen).toBe('summary'); expect(screen.getByText('Победа чёрных')).toBeInTheDocument()
  expect(screen.getAllByRole('row')).toHaveLength(12)
  await user.click(screen.getByRole('button', { name: 'Возобновить игру' })); expect(app.getState().screen).toBe('game')
})
test('без победителя и новая игра с тем же составом', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'finishGame', winner: null }) })
  expect(screen.getByText('Без победителя')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Новая игра с тем же составом' }))
  expect(app.getState()).toMatchObject({ screen: 'setup', draft: { playerCount: 11 } })
})
test('журнал копируется текстом', async () => {
  const { user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'finishGame', winner: 'red' }) })
  // В плане буфер подменялся через Object.assign до renderApp: у navigator.clipboard только геттер,
  // а userEvent.setup() ставит свою заглушку. Подменяем после и через defineProperty.
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  await user.click(screen.getByRole('button', { name: 'Скопировать журнал' }))
  expect(writeText.mock.calls[0]![0]).toContain('Распределение')
})

// Сверх плана
test('победителя можно изменить; «Вернуться в игру» ничего не меняет', async () => {
  const { app, user } = renderApp((a) => seedGame(a, TABLE_11, 2))
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Вернуться в игру' }))
  expect(app.getState().screen).toBe('game'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  app.dispatch({ type: 'finishGame', winner: 'red' })
  await user.click(await screen.findByRole('button', { name: 'Изменить победителя' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('radio', { name: /Красные/ })).toBeChecked()
  await user.click(dialog.getByRole('radio', { name: /Без победителя/ })); await user.click(dialog.getByRole('button', { name: /^Сохранить/ }))
  expect(app.getState().game!.finished).toEqual({ winner: null }); expect(app.getState().screen).toBe('summary')
})
test('итоги: судьба игроков в таблице, завершённая игра открывается с главной', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'shot' }); a.dispatch({ type: 'finishGame', winner: 'black' }) })
  expect(within(screen.getAllByRole('row')[9]!).getByText(/застрелен · День 2/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'На главную' }))
  expect(screen.getByText('Победа чёрных')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Открыть' })); expect(app.getState().screen).toBe('summary')
})
