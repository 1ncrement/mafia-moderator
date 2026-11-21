import { act, screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { advance, renderApp, seedGame } from './helpers'
import { card, leaving, staying, summaryOf } from './roleNights'

// Бронежилет на экране. Стол: №1 шериф, №2 бронежилет, №3 крёстный отец, №4 доктор, №5 мясник, №6 охранник, №8 мафия, №10 проститутка.
const TABLE = 'S bulletproof G D butcher bodyguard c M c P c'
/** День 2, выставлен один №2 (бронежилет), шаг оправданий пройден. */
const single = (a: AppStore) => {
  seedGame(a, TABLE, 2); a.dispatch({ type: 'nominate', by: 5, target: 2 }); a.dispatch({ type: 'enterStep', step: 'defense' })
  a.dispatch({ type: 'startSpeech', kind: 'defense', seat: 2 }); a.dispatch({ type: 'endSpeech' })
}
const openPanel = async (user: ReturnType<typeof renderApp>['user'], seat: number) => user.click(screen.getByRole('button', { name: `Игрок №${seat}` }))

test('итог ночи: «Был в бронежилете — в него стреляла мафия · жилет снят, роль открыта»; никто не покидает стол', async () => {
  const { app, user, env } = renderApp(summaryOf(TABLE, [['mafia_shot', null, 2]]))
  expect(within(leaving()).getByText('Никто не покидает стол')).toBeInTheDocument(); expect(within(leaving()).getByText('удар принял бронежилет')).toBeInTheDocument()
  expect(within(staying()!).getByText('№2')).toBeInTheDocument(); expect(within(staying()!).getByText('Был в бронежилете')).toBeInTheDocument()
  expect(within(staying()!).getByText('в него стреляла мафия · жилет снят, роль открыта')).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Никто не выбыл · начать День 2/ }))
  expect(app.getState().game!.players[1]).toMatchObject({ status: 'alive', vest: 'used' })
  // Утро: «был в бронежилете — остаётся в игре».
  const dialog = within(screen.getByRole('dialog', { name: 'Объяви столу' }))
  expect(dialog.getByText('Город просыпается в полном составе')).toBeInTheDocument()
  expect(dialog.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['№2был в бронежилете — остаётся в игре'])
})
test('карточка «жилет снят · открыт» видна и при скрытых ролях; пока жилет цел, метки нет', async () => {
  const { app } = renderApp((a) => { seedGame(a, TABLE, 2); a.setSettings({ rolesHidden: true }) })
  expect(within(card(2)).queryByText('жилет снят · открыт')).not.toBeInTheDocument()
  act(() => { app.dispatch({ type: 'setVest', seat: 2, used: true }) })
  expect(within(card(2)).getByText('жилет снят · открыт')).toBeInTheDocument(); expect(card(2)).toHaveClass('card-open')
  expect(within(card(2)).getByText('роль скрыта')).toBeInTheDocument()
  act(() => { app.setSettings({ rolesHidden: false }) })
  expect(within(card(2)).getByText('жилет снят · открыт')).toBeInTheDocument(); expect(within(card(2)).getByText('бронежилет')).toBeInTheDocument()
})
test('панель игрока: «Снять жилет» и «Вернуть жилет» — только у бронежилета; при скрытых ролях целый жилет панель не выдаёт', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE, 2); a.setSettings({ rolesHidden: false }) })
  await openPanel(user, 7)
  expect(screen.queryByRole('button', { name: /жилет/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Закрыть' })); await openPanel(user, 2)
  await user.click(screen.getByRole('button', { name: 'Снять жилет' }))
  expect(app.getState().game!.players[1]!.vest).toBe('used')
  await openPanel(user, 2); await user.click(screen.getByRole('button', { name: 'Вернуть жилет' }))
  expect(app.getState().game!.players[1]!.vest).toBe('intact')
  // Роли скрыты: кнопка «Снять жилет» назвала бы роль — её нет; у снятого жилета роль уже открыта, вернуть можно.
  act(() => { app.setSettings({ rolesHidden: true }) })
  await openPanel(user, 2); expect(screen.queryByRole('button', { name: /жилет/ })).not.toBeInTheDocument()
  act(() => { app.dispatch({ type: 'setVest', seat: 2, used: true }) })
  expect(screen.getByRole('button', { name: 'Вернуть жилет' })).toBeInTheDocument()
})
test('выставлен один бронежилет: главная кнопка «№2 в бронежилете — остаётся → Ночь 2», прощания нет', async () => {
  const { app, user, env } = renderApp(single)
  advance(env, 500); await user.click(screen.getByRole('button', { name: /№2 в бронежилете — остаётся → Ночь 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 2 })
  expect(app.getState().game!.players[1]).toMatchObject({ status: 'alive', vest: 'used' })
  expect(within(card(2)).getByText('жилет снят · открыт')).toBeInTheDocument()
  // «Отменить» возвращает и день, и жилет.
  act(() => { app.undo() })
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(app.getState().game!.players[1]!.vest).toBe('intact')
})
test('голосование: лидер в бронежилете остаётся; во второй раз его выгоняют по-настоящему, с прощанием', async () => {
  const voting = (day: number) => (a: AppStore) => {
    seedGame(a, TABLE, day); a.dispatch({ type: 'nominate', by: 5, target: 2 }); a.dispatch({ type: 'nominate', by: 6, target: 9 })
    a.dispatch({ type: 'enterStep', step: 'vote' }); a.dispatch({ type: 'setVotes', ballot: 1, candidate: 2, count: 8 })
  }
  const first = renderApp(voting(2))
  advance(first.env, 500); await first.user.click(screen.getByRole('button', { name: /№2 в бронежилете — остаётся → Ночь 2/ }))
  expect(first.app.getState().game!.phase).toEqual({ kind: 'night', n: 2 }); expect(first.app.getState().game!.players[1]).toMatchObject({ status: 'alive', vest: 'used' })
  first.unmount()
  const second = renderApp((a) => { voting(2)(a); a.dispatch({ type: 'setVest', seat: 2, used: true }) })
  advance(second.env, 500); await second.user.click(screen.getByRole('button', { name: /№2 выгнан → прощание · 30 с/ }))
  expect(second.app.getState().game!.step).toBe('farewell'); expect(second.app.getState().game!.players[1]).toMatchObject({ status: 'out', cause: 'voted' })
})
test('вторая ничья, «Выгнать обоих»: бронежилет остаётся, второй прощается; строка называет спасённого', async () => {
  const { app, user } = renderApp((a) => {
    seedGame(a, TABLE, 2); a.dispatch({ type: 'nominate', by: 5, target: 2 }); a.dispatch({ type: 'nominate', by: 6, target: 9 })
    a.dispatch({ type: 'setVotes', ballot: 1, candidate: 2, count: 5 }); a.dispatch({ type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [2, 9] })
    a.dispatch({ type: 'enterStep', step: 'revote' }); a.dispatch({ type: 'setVotes', ballot: 2, candidate: 2, count: 4 }); a.dispatch({ type: 'setVoters', ballot: 2, count: 8 })
  })
  await user.click(screen.getByRole('button', { name: /Выгнать обоих: №2 и №9/ }))
  expect(app.getState().game!.step).toBe('farewell')
  expect(app.getState().game!.day).toMatchObject({ spared: [2], farewell: { waiting: [9] } })
  expect(screen.getByText('№2 был в бронежилете — остаётся в игре')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Прощание №9 · 30 с/ })).toBeInTheDocument()
})
test('украинские строки жилета', () => {
  renderApp((a) => { seedGame(a, TABLE, 2); a.setSettings({ lang: 'uk', rolesHidden: false }); a.dispatch({ type: 'setVest', seat: 2, used: true }) })
  expect(within(screen.getByRole('button', { name: 'Гравець №2' })).getByText('жилет знято · відкритий')).toBeInTheDocument()
})
