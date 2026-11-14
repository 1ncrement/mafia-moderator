import { screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from './helpers'

const afterNight = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 }); a.dispatch({ type: 'confirmNight', chosen: 7 }) }
test('правка прошлой ночи предлагает исправить статусы', async () => {
  const { app, user } = renderApp(afterNight)
  await user.click(screen.getByRole('button', { name: /^Ночь 1/ }))
  await user.click(screen.getByRole('button', { name: /Мафия → №7/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(app.getState().game!.players[6]!.status).toBe('out')
  expect(screen.getByText(/Итог Ночи 1 теперь другой: выбыть должен №9/)).toBeInTheDocument(); expect(screen.getByText('испр.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Исправить' }))
  expect(app.getState().game!.players[6]!.status).toBe('alive'); expect(app.getState().game!.players[8]!.status).toBe('out')
})
test('в редакторе прошлой ночи доступны те, кто был тогда в игре', async () => {
  const { user } = renderApp(afterNight)
  await user.click(screen.getByRole('button', { name: /^Ночь 1/ }))
  await user.click(screen.getByRole('button', { name: /Шериф — не записано/ }))
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №7' })).toBeEnabled()
})
test('настройки таймеров действуют со следующего запуска', async () => {
  const { app, user } = renderApp((a) => seedGame(a, TABLE_11, 1))
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Настройки таймеров' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Речь игрока: больше' }))
  expect(app.getState().session!.config.durations.speech).toBe(65)
})

// Сверх плана
test('«Оставить» убирает предупреждение и не трогает статусы', async () => {
  const { app, user } = renderApp((a) => { afterNight(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: null, phase: { kind: 'night', n: 1 } }) })
  expect(screen.getByText(/Итог Ночи 1 теперь другой: никто не должен выбыть/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Оставить' }))
  expect(screen.queryByText(/Итог Ночи 1 теперь другой/)).not.toBeInTheDocument(); expect(app.getState().game!.players[6]!.status).toBe('out')
})
test('правка записей дня: выставление, голоса, ручной статус, удаление', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'nominate', by: 5, target: 7 }); a.dispatch({ type: 'nominate', by: 6, target: 3 })
    a.dispatch({ type: 'setVotes', ballot: 1, candidate: 7, count: 4 }); a.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'shot' }); a.dispatch({ type: 'openCircle', first: 5 }) })
  await user.click(screen.getByRole('button', { name: /№5 выставил №7/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №10' }))
  expect(app.getState().game!.day!.nominations.map((n) => [n.by, n.target])).toEqual([[6, 3], [5, 10]])
  await user.click(screen.getByRole('button', { name: /№6 выставил №3/ })); await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить запись' }))
  expect(app.getState().game!.day!.nominations.map((n) => n.target)).toEqual([10])
  await user.click(screen.getByRole('button', { name: /№9 застрелен/ })); await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выгнан' }))
  expect(app.getState().game!.players[8]).toMatchObject({ status: 'out', cause: 'voted' })
  await user.click(screen.getByRole('button', { name: /№9 выгнан/ })); await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить запись' }))
  expect(app.getState().game!.players[8]!.status).toBe('alive')
  await user.click(screen.getByRole('button', { name: /Круг начал №5/ })); await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить запись' }))
  expect(app.getState().game!.day!.opener).toBeNull()
})
test('правка голосов прошлого дня и запись задним числом', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'nominate', by: 5, target: 7 }); a.dispatch({ type: 'nominate', by: 6, target: 3 })
    a.dispatch({ type: 'setVotes', ballot: 1, candidate: 7, count: 4 }); a.dispatch({ type: 'resolveVote', ballot: 1, outcome: 'nobody', seats: [] })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'confirmNight', chosen: null }) })
  await user.click(screen.getByRole('button', { name: /^День 2/ }))
  await user.click(screen.getByRole('button', { name: /Голоса: №7 — 4/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '№7: больше' }))
  const votes = app.getState().session!.log.filter((e) => e.type === 'votes_set')
  expect(votes).toMatchObject([{ candidate: 7, count: 5, edited: true, phase: { kind: 'day', n: 2 } }])
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Готово' }))
  await user.click(screen.getByRole('button', { name: 'Добавить запись…' }))
  const dialog = within(screen.getByRole('dialog'))
  await user.click(dialog.getByRole('button', { name: 'Статус игрока' })); await user.click(dialog.getByRole('button', { name: 'Выбрать игрока №2' }))
  await user.click(dialog.getByRole('button', { name: 'Выгнан' }))
  expect(app.getState().game!.players[1]).toMatchObject({ status: 'out', cause: 'voted', outPhase: { kind: 'day', n: 2 } })
})

// По итогам ревью ветки
test('запись итога ночи и запись исхода голосования открываются и правятся', async () => {
  const { app, user } = renderApp((a) => { afterNight(a); a.dispatch({ type: 'nominate', by: 5, target: 3 }); a.dispatch({ type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [3] }) })
  await user.click(screen.getByRole('button', { name: /Выгнан №3/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Никто не выгнан' }))
  expect(app.getState().game!.players[2]!.status).toBe('alive'); expect(screen.getByRole('button', { name: /Никто не выгнан/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /^Ночь 1/ })); await user.click(screen.getByRole('button', { name: /Итог ночи: №7 застрелен/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Никто не выбыл' }))
  expect(app.getState().game!.players[6]!.status).toBe('alive'); expect(screen.getByRole('button', { name: /Итог ночи: никто не выбыл/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Итог ночи: никто не выбыл/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(app.getState().game!.players[8]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } })
})
