import { screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from './helpers'

const voting = (a: AppStore) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'shot' });
  [7, 3, 10, 11, 4].forEach((t, i) => a.dispatch({ type: 'nominate', by: i + 1, target: t })); a.dispatch({ type: 'enterStep', step: 'vote' }) }
const tied = (a: AppStore) => { voting(a); [[7, 0], [3, 2], [10, 3], [11, 2]].forEach(([c, n]) => a.dispatch({ type: 'setVotes', ballot: 1, candidate: c!, count: n! }))
  a.dispatch({ type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [10, 4] }); a.dispatch({ type: 'enterStep', step: 'revote' }) }

test('ввод голосов кнопками, остаток последнему, ничья', async () => {
  const { app, user, env } = renderApp(voting)
  for (const n of ['0', '2', '3']) await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: n }))
  expect(screen.getByText('За №11 — сколько голосов?')).toBeInTheDocument(); expect(screen.getByText(/голосуют 10 · осталось 5/)).toBeInTheDocument()
  expect(within(screen.getByRole('group', { name: 'Число голосов' })).getAllByRole('button')).toHaveLength(6)
  await user.keyboard('2'); advance(env, 500)
  expect(app.getState().game!.day!.ballots[0]).toMatchObject({ complete: true, hint: { outcome: 'tie', seats: [10, 4] } })
  await user.click(screen.getByRole('button', { name: /Ничья №10 и №4 → речи по 30 с/ }))
  expect(app.getState().game!.step).toBe('tiebreak')
})
test('вторая ничья: решает ведущий', async () => {
  const { app, user } = renderApp((a) => { tied(a); a.dispatch({ type: 'setVotes', ballot: 2, candidate: 10, count: 4 }) })
  expect(screen.getByText('Снова ничья')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выгнать одного…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №4' }))
  expect(app.getState().game!.players[3]).toMatchObject({ status: 'out', cause: 'voted' }); expect(app.getState().game!.step).toBe('farewell')
})
test('никто не выгнан — сразу ночь', async () => {
  const { app, user } = renderApp(voting)
  await user.click(screen.getByRole('button', { name: /Никто не выгнан → Ночь 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 2 })
})

// Сверх плана
test('один лидер: выгнан одной кнопкой; число на карточке; исправление числа по клику на строку', async () => {
  const { app, user, env } = renderApp(voting)
  for (const n of ['5', '2', '1', '1']) await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: n }))
  expect(within(screen.getByRole('button', { name: 'Игрок №7' })).getByText('голосов: 5')).toBeInTheDocument()
  expect(screen.getByText(/все оставшиеся голоса/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /№3.*изменить/ }))
  expect(screen.getByText('За №3 — сколько голосов?')).toBeInTheDocument()
  await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: '0' }))
  expect(app.getState().game!.day!.ballots[0]!.entries.map((e) => e.count)).toEqual([5, 0, 1, 1, 3])
  advance(env, 500); await user.click(screen.getByRole('button', { name: /№7 выгнан → прощание · 30 с/ }))
  expect(app.getState().game!.players[6]).toMatchObject({ status: 'out', cause: 'voted' }); expect(app.getState().game!.step).toBe('farewell')
  app.undo(); expect(app.getState().game!.players[6]!.status).toBe('alive'); expect(app.getState().game!.step).toBe('vote')
})
test('число голосующих можно поправить, голоса — сбросить, выгнать другого', async () => {
  const { app, user } = renderApp(voting)
  await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: '4' }))
  await user.click(screen.getByRole('button', { name: 'Голосуют не 10…' }))
  await user.click(screen.getByRole('button', { name: 'Число голосующих: меньше' }))
  expect(app.getState().game!.day!.ballots[0]).toMatchObject({ voters: 9, votersOverridden: true })
  await user.click(screen.getByRole('button', { name: 'Голосовать заново' }))
  expect(app.getState().game!.day!.ballots[0]!.entries.every((e) => e.count === null)).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Выгнать другого…' })); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №2' }))
  expect(app.getState().game!.players[1]).toMatchObject({ status: 'out', cause: 'voted' }); expect(app.getState().game!.day!.farewell.waiting).toEqual([2])
})
test('переголосование: голосуют без ничейных; выгнать обоих; в туре без голосующих решает ведущий', async () => {
  const first = renderApp(tied)
  expect(screen.getByText(/Переголосование · голосуют 8, без №10 и №4/)).toBeInTheDocument()
  expect(screen.queryByText('Снова ничья')).not.toBeInTheDocument()
  await first.user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: '4' }))
  await first.user.click(screen.getByRole('button', { name: 'Выгнать обоих: №10 и №4' }))
  expect(first.app.getState().game!.day!.farewell.waiting).toEqual([10, 4])
  first.unmount()
  renderApp((a) => { tied(a); a.dispatch({ type: 'setVoters', ballot: 2, count: 0 }) })
  expect(screen.getByRole('button', { name: 'Выгнать одного…' })).toBeInTheDocument()
})

// По итогам ревью ветки
test('цифры с клавиатуры работают, только когда двузначного числа быть не может', async () => {
  const { app, user } = renderApp(voting)
  await user.keyboard('1')                       // осталось 10: «1» может быть началом «10» — клавиша не действует
  expect(app.getState().game!.day!.ballots[0]!.entries[0]!.count).toBeNull()
  expect(screen.queryByText(/Можно нажать цифру/)).not.toBeInTheDocument()
  await user.click(within(screen.getByRole('group', { name: 'Число голосов' })).getByRole('button', { name: '1' }))
  await user.keyboard('3')                       // осталось 9: цифра записывает
  expect(app.getState().game!.day!.ballots[0]!.entries.map((e) => e.count).slice(0, 2)).toEqual([1, 3])
  expect(screen.getByText(/Можно нажать цифру/)).toBeInTheDocument()
})
