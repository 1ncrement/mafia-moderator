import { act, screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from '../ui/helpers'

// Спецификация 5.8: «Сумма голосов не может превысить число голосующих: ввод ограничен остатком».
// Спецификация 6.1, принцип 4: «Единственный жёсткий запрет в игре — сумма голосов больше числа голосующих».

const voting = (a: AppStore) => {
  seedGame(a, TABLE_11, 2)
  a.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'shot' })
  ;[7, 3, 10].forEach((t, i) => a.dispatch({ type: 'nominate', by: i + 1, target: t }))
  a.dispatch({ type: 'enterStep', step: 'vote' })
}
const sumAndVoters = (app: AppStore) => {
  const ballot = app.getState().game!.day!.ballots[0]!
  return { sum: ballot.entries.reduce((s, e) => s + (e.count ?? 0), 0), voters: ballot.voters }
}

test('«Голосуют не N…» не даёт опустить число голосующих ниже уже введённой суммы голосов', async () => {
  const { app, user, env } = renderApp(voting)
  // Голосуют 10. За №7 — 6, за №3 — 4: голоса кончились, №10 получает 0.
  for (const n of ['6', '4']) await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: n }))
  expect(sumAndVoters(app)).toEqual({ sum: 10, voters: 10 })
  await user.click(screen.getByRole('button', { name: 'Голосуют не 10…' }))
  for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Число голосующих: меньше' }))
  advance(env, 500)
  const { sum, voters } = sumAndVoters(app)
  expect(sum).toBeLessThanOrEqual(voters)
})

test('исход нельзя подтвердить, пока голосов введено больше, чем голосующих', async () => {
  const { app, user, env } = renderApp(voting)
  for (const n of ['6', '4']) await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: n }))
  // Посреди голосования игрока отметили выбывшим: голосуют уже 9, а голосов введено 10.
  act(() => { app.dispatch({ type: 'setStatus', seat: 2, status: 'out', cause: 'voted' }) })
  expect(sumAndVoters(app)).toEqual({ sum: 10, voters: 9 })
  expect(screen.getByRole('alert')).toHaveTextContent(/больше голосов, чем голосующих/)
  advance(env, 500)
  await user.keyboard('{Enter}')
  // В журнал не должен попасть исход по таблице «10 голосов при 9 голосующих».
  expect(app.getState().game!.players[6]!.status).toBe('alive')
  expect(app.getState().game!.day!.ballots[0]!.resolved).toBeNull()
})

test('движок не принимает число голосующих меньше уже введённой суммы голосов', () => {
  const { app } = renderApp(voting)
  act(() => {
    app.dispatch({ type: 'setVotes', ballot: 1, candidate: 7, count: 6 })
    app.dispatch({ type: 'setVotes', ballot: 1, candidate: 3, count: 4 })
  })
  let result: ReturnType<AppStore['dispatch']> | undefined
  act(() => { result = app.dispatch({ type: 'setVoters', ballot: 1, count: 7 }) })
  expect(result).toEqual({ ok: false, reason: 'votes_exceed' })
  expect(sumAndVoters(app)).toEqual({ sum: 10, voters: 10 })
})
