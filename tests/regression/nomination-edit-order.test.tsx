import { screen, within } from '@testing-library/react'
import { attempt, game, play, st, TABLE_11, toDay } from '../helpers'
import { renderApp, seedGame } from '../ui/helpers'

// Спецификация 5.7.3: «Список хранит порядок выставления и автора».
// Спецификация 5.7.4 и 5.8: оправдания и ввод голосов идут «в порядке выставления».
// Спецификация 6.5: «Клик по записи открывает тот же выбор, что был при её создании».
//
// Ведущий ошибся номером в первом выставлении (№5 выставил не №7, а №10) и правит запись в журнале.
// Порядок выставления от этого не меняется: №5 выставлял первым.

test('правка выставления в журнале не меняет порядок выставления', async () => {
  const { app, user } = renderApp((a) => {
    seedGame(a, TABLE_11, 2)
    a.dispatch({ type: 'enterStep', step: 'speeches' })
    a.dispatch({ type: 'openCircle', first: 5 })
    a.dispatch({ type: 'nominate', by: 5, target: 7 })
    a.dispatch({ type: 'nominate', by: 6, target: 3 })
    a.dispatch({ type: 'nominate', by: 8, target: 11 })
  })
  await user.click(screen.getByRole('button', { name: /№5 выставил №7/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №10' }))
  const day = app.getState().game!.day!
  // Исправленная запись остаётся первой: оправдания и голосование идут 10, 3, 11.
  expect(day.nominations.map((n) => [n.by, n.target])).toEqual([[5, 10], [6, 3], [8, 11]])
  expect(day.defense.waiting).toEqual([10, 3, 11])
})

// Движок: правка меняет только номер выставленного — место в списке, автор и числа голосов остаются.

test('правка выставления сохраняет числа голосов за исправленного кандидата', () => {
  let s = play(toDay(game(TABLE_11), 2),
    { type: 'nominate', by: 5, target: 7 }, { type: 'nominate', by: 6, target: 3 },
    { type: 'setVotes', ballot: 1, candidate: 7, count: 4 })
  const id = st(s).day!.nominations[0]!.eventId
  s = play(s, { type: 'editNomination', id, target: 10 })
  expect(st(s).day!.ballots[0]!.entries).toEqual([
    { candidate: 10, count: 4, auto: false },
    { candidate: 3, count: 7, auto: true },
  ])
})

test('исправить выставление на уже выставленного нельзя', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'nominate', by: 5, target: 7 }, { type: 'nominate', by: 6, target: 3 })
  const id = st(s).day!.nominations[0]!.eventId
  expect(attempt(s, { type: 'editNomination', id, target: 3 })).toEqual({ ok: false, reason: 'already_nominated' })
  expect(attempt(s, { type: 'editNomination', id: 'нет такого', target: 10 })).toEqual({ ok: false, reason: 'unknown_event' })
})
