import { screen, within } from '@testing-library/react'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from '../ui/helpers'

// Спецификация 5.9: «Завершение можно отменить, победителя — изменить».
// Спецификация 6.6: «"Отменить" откатывает последнее действие любого типа: выбор, выставление, ввод голосов,
// смену статуса, переход шага или фазы, правку журнала. Нажимается многократно. Стек около 50 действий».
//
// Ведущий остановил игру раньше времени, нажал «Возобновить игру» и продолжает. Первое же «Отменить»
// не должно снова завершать игру: оно откатывает последнее игровое действие.

test('«Отменить» после «Возобновить игру» не завершает игру снова', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'enterStep', step: 'speeches' }); a.dispatch({ type: 'openCircle', first: 5 }) })
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  const dialog = within(screen.getByRole('dialog'))
  await user.click(dialog.getByRole('radio', { name: /Чёрные/ })); await user.click(dialog.getByRole('button', { name: 'Завершить: победа чёрных' }))
  await user.click(screen.getByRole('button', { name: 'Возобновить игру' }))
  expect(app.getState().screen).toBe('game')

  await user.click(screen.getByRole('button', { name: 'Отменить' }))
  expect(app.getState().game!.finished).toBeNull()
  expect(app.getState().screen).toBe('game')
  // Откатилось последнее игровое действие — выбор начинающего круг.
  expect(app.getState().game!.day!.opener).toBeNull()
})
