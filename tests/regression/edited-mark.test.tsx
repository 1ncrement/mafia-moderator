import { screen, within } from '@testing-library/react'
import { DEFAULT_REGISTRY, journal } from '../../src/engine'
import type { AppStore } from '../../src/app/store'
import type { JournalEntry } from '../../src/engine'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from '../ui/helpers'

// Спецификация 6.5: «Клик по записи открывает тот же выбор, что был при её создании.
// Исправленная запись получает метку «испр.»».

const today = (app: AppStore): JournalEntry[] => journal(app.getState().session!, DEFAULT_REGISTRY)[0]!.entries

test('исправленное выставление получает метку «испр.»', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'nominate', by: 5, target: 7 }) })
  await user.click(screen.getByRole('button', { name: /№5 выставил №7/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №10' }))
  expect(today(app).find((e) => e.kind === 'nomination')).toMatchObject({ by: 5, target: 10, edited: true })
})

test('исправленный ручной статус получает метку «испр.»', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'shot' }) })
  await user.click(screen.getByRole('button', { name: /№9 застрелен/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выгнан' }))
  expect(today(app).find((e) => e.kind === 'status')).toMatchObject({ seat: 9, cause: 'voted', edited: true })
})

test('исправленный исход голосования получает метку «испр.»', async () => {
  const { app, user } = renderApp((a) => {
    seedGame(a, TABLE_11, 2)
    a.dispatch({ type: 'nominate', by: 5, target: 7 }); a.dispatch({ type: 'nominate', by: 6, target: 3 })
    a.dispatch({ type: 'setVotes', ballot: 1, candidate: 7, count: 4 })
    a.dispatch({ type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [3] })
  })
  await user.click(screen.getByRole('button', { name: /Выгнан №3/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(today(app).find((e) => e.kind === 'vote_result')).toMatchObject({ outcome: 'eliminated', seats: [7], edited: true })
})
