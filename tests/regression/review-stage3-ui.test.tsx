import { act, screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from '../ui/helpers'
import { card, nightOf, summaryOf } from '../ui/roleNights'

// Находки независимого ревью трёх этапов (2026-11-21), экран.

const N1 = { kind: 'night', n: 1 } as const
const pickable = (n: number) => screen.queryByRole('button', { name: `Выбрать игрока №${n}` })

test('скрытые роли: на шаге охранника его собственная карточка не заперта — запертая выдала бы, кто охранник', async () => {
  // №2 охранник.
  const { app, user } = renderApp((a) => { nightOf('S bodyguard G D butcher c c M c P c', [], 'bodyguard_guard:2')(a); a.setSettings({ rolesHidden: true }) })
  for (let n = 1; n <= 11; n++) expect(pickable(n)).toBeInTheDocument()
  expect(document.querySelectorAll('.card-locked')).toHaveLength(0)
  // Клик по самому охраннику движок не записывает; ведущий видит нейтральную строку.
  await user.click(pickable(2)!)
  expect(app.getState().game!.night!.steps.at(-1)!.recorded).toBe(false)
  expect(screen.getByText('Не записано: этого игрока на этом шаге выбрать нельзя.')).toBeInTheDocument()
  await user.click(pickable(7)!)
  expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ recorded: true, target: 7 })
  expect(screen.queryByText(/Не записано/)).not.toBeInTheDocument()
  // С открытыми ролями карточка охранника заперта, как и была.
  act(() => { app.setSettings({ rolesHidden: false }) })
  expect(pickable(2)).not.toBeInTheDocument()
})
test('скрытые роли: на шаге журналиста не заперты ни он сам, ни уже проверенные', async () => {
  // №2 журналист; в Ночь 1 проверены №9 и №11.
  const { app } = renderApp((a) => {
    nightOf('S journalist G D bulletproof butcher maniac M c P c', [['journalist_compare', 2, 9, 11]])(a)
    a.dispatch({ type: 'confirmNight', died: [] }); a.dispatch({ type: 'announceMorning' })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: 'journalist_compare:2' }); a.setSettings({ rolesHidden: true })
  })
  for (const n of [2, 9, 11, 1]) expect(pickable(n)).toBeInTheDocument()
  expect(document.querySelectorAll('.card-locked')).toHaveLength(0)
  act(() => { app.setSettings({ rolesHidden: false }) })
  for (const n of [2, 9, 11]) expect(pickable(n)).not.toBeInTheDocument()
})
test('окно утра: «Отменить» есть, только пока последнее действие — подтверждение ночи', async () => {
  const { app } = renderApp((a: AppStore) => {
    seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: N1 }); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
    a.dispatch({ type: 'confirmNight', died: [7] })
  })
  const dialog = () => within(screen.getByRole('dialog', { name: 'Объяви столу' }))
  expect(dialog().getByRole('button', { name: 'Отменить' })).toBeInTheDocument()
  // Последнее действие — уже не подтверждение ночи (запись статуса задним числом): общая отмена из окна сняла бы его, а не ночь.
  act(() => { app.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'shot', phase: N1 }) })
  expect(dialog().queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument()
})
test('игра без события «объявил», открытая посреди дня, окно утра не показывает; кнопка «Объявление утра» есть', () => {
  renderApp((a: AppStore) => {
    seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: N1 }); a.dispatch({ type: 'confirmNight', died: [] })
    a.dispatch({ type: 'nominate', by: 5, target: 9 })
  })
  expect(screen.queryByRole('dialog', { name: 'Объяви столу' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Объявление утра' })).toBeInTheDocument()
})
test('ход молчащего: на его карточке «молчит», но не «говорит сейчас»; «Выставить» из панели игрока пишется от его имени', async () => {
  // №2 маньяк, жертва — №7.
  const { app, user, env } = renderApp((a) => {
    nightOf('S maniac G D bulletproof bodyguard c M c P c', [['maniac_visit', 2, 7]])(a)
    a.dispatch({ type: 'confirmNight', died: [] }); a.dispatch({ type: 'announceMorning' })
    a.dispatch({ type: 'enterStep', step: 'speeches' }); a.dispatch({ type: 'openCircle', first: 7 }); a.dispatch({ type: 'startSpeech', kind: 'silent', seat: 7 })
  })
  expect(within(card(7)).getByText('молчит')).toBeInTheDocument(); expect(within(card(7)).queryByText('говорит сейчас')).not.toBeInTheDocument()
  advance(env, 500)
  await user.click(card(9)); await user.click(screen.getByRole('button', { name: 'Выставить' }))
  expect(app.getState().game!.day!.nominations).toMatchObject([{ target: 9, by: 7 }])
})
test('итог ночи: полоса шагов сжата, чтобы список выбывших помещался над кнопками; на шаге роли — обычная', () => {
  const { app } = renderApp(summaryOf(TABLE_11, [['mafia_shot', null, 7]]))
  const nav = () => document.querySelector('.night-steps') as HTMLElement
  expect(nav()).toHaveAttribute('data-compact')
  // Шаги остаются кнопками с записанным выбором.
  expect(within(nav()).getByRole('button', { name: /Мафия.*№7/ })).toBeInTheDocument()
  act(() => { app.dispatch({ type: 'enterStep', step: 'mafia_shot' }) })
  expect(nav()).not.toHaveAttribute('data-compact')
})
