import { screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from '../ui/helpers'

// Спецификация 6.4: длительности «меняются в настройках сессии, применяются со следующего запуска».
// Окно настроек обещает то же: «Новые длительности действуют со следующего запуска таймера».
async function speechTo90(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Меню' }))
  await user.click(screen.getByRole('menuitem', { name: 'Настройки таймеров' }))
  const dialog = within(screen.getByRole('dialog'))
  for (let i = 0; i < 6; i++) await user.click(dialog.getByRole('button', { name: 'Речь игрока: больше' }))
  await user.click(dialog.getByRole('button', { name: 'Готово' }))
}
const speaking = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) }

test('таймер в «готов» (запуск отдельной кнопкой): после смены длительности «Старт» идёт на новую', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.updateConfig({ separateTimerStart: true }); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) })
  expect(app.getState().session!.timer).toMatchObject({ seat: 5, status: 'ready', durationMs: 60_000 })
  await speechTo90(user)
  expect(app.getState().session!.config.durations.speech).toBe(90)
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Старт/ }))
  expect(app.getState().session!.timer).toMatchObject({ seat: 5, status: 'running', durationMs: 90_000 })
})

test('«Заново» после смены длительности возвращает новую полную длительность', async () => {
  const { app, user, env } = renderApp(speaking)
  await speechTo90(user)
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: 'Заново' }))
  expect(app.getState().session!.timer).toMatchObject({ seat: 5, status: 'ready', remainingMs: 90_000 })
})
