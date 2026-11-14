import { screen } from '@testing-library/react'
import type { Session } from '../../src/engine'
import { n1, play, st, TABLE_11 } from '../helpers'
import { renderApp, seedGame } from '../ui/helpers'

// Спецификация 6.1, принцип 1: «Ничего не происходит само. Смена шага, запуск таймера и выбытие —
// только по нажатию ведущего». 5.10: «Если статус меняется посреди шага, всё пересчитывается от текущих статусов».
// Ведущий стоит на шаге роли и правит статус (или роль) её носителя: шаг должен остаться шагом этой роли
// (стать серым или активным), а не перескочить на первый шаг ночи.

const N1 = { kind: 'night', n: 1 } as const
/** Действие шага, на котором сейчас стоит ведущий. */
const currentAction = (s: Session) => {
  const g = st(s)
  return g.night!.steps.find((x) => x.id === g.step)?.actionId
}

test('на сером шаге шерифа ведущий возвращает шерифа в игру — остаётся на шаге шерифа', async () => {
  const { app, user } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'setStatus', seat: 1, status: 'out', cause: 'voted' })
    a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
    a.dispatch({ type: 'enterStep', step: 'sheriff_check' })
  })
  expect(screen.getAllByText(/выбыл · разбудить для вида/).length).toBeGreaterThan(0)
  await user.click(screen.getByRole('button', { name: 'Игрок №1' }))
  await user.click(screen.getByRole('button', { name: 'Вернуть в игру' }))
  // Шаг шерифа стал активным: стол спрашивает про шерифа, а не про мафию.
  expect(app.getState().game!.step).toBe('sheriff_check:1')
  expect(screen.getByText('Кого проверяет шериф?')).toBeInTheDocument()
  expect(screen.queryByText('В кого стреляет мафия?')).not.toBeInTheDocument()
})

test('на шаге доктора ведущий отмечает доктора выбывшим — остаётся на шаге доктора (теперь сером)', () => {
  const s = play(n1(), { type: 'enterStep', step: 'doctor_heal:4' }, { type: 'setStatus', seat: 4, status: 'out', cause: 'voted' })
  expect(currentAction(s)).toBe('doctor_heal')
})

test('на шаге шерифа ведущий меняет роли шерифа и соседа — остаётся на шаге шерифа', () => {
  const s = play(n1(), { type: 'enterStep', step: 'sheriff_check:1' }, { type: 'swapRoles', a: 1, b: 2 })
  expect(currentAction(s)).toBe('sheriff_check')
})
