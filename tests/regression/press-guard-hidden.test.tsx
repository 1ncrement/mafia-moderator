import { screen } from '@testing-library/react'
import { advance, renderApp, seedGame } from '../ui/helpers'

// Спецификация 6.6: «Главная кнопка не реагирует первые ~0,4 секунды после смены шага,
// чтобы двойное нажатие не проскочило шаг». При скрытых ролях шаги двух докторов называются
// одинаково («Доктор»), подпись главной кнопки не меняется — и защита не включается.
test('скрытые роли, два доктора: двойной клик по «Дальше: Доктор» не проскакивает шаг первого доктора', async () => {
  const { app, user, env } = renderApp((a) => {
    seedGame(a, 'S D G M c c c c D', 1)
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' })
    a.setSettings({ rolesHidden: true })
  })
  advance(env, 1000)
  await user.dblClick(screen.getByRole('button', { name: /Дальше: Доктор/ }))
  expect(app.getState().game!.step).toBe('doctor_heal:2')
})
