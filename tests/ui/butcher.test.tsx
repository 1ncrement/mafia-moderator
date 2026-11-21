import { screen, within } from '@testing-library/react'
import { advance, renderApp } from './helpers'
import { card, leaving, mark, nightOf, outSeats, staying, summaryOf } from './roleNights'

// Мясник на экране ночи. Стол: №1 шериф, №2 мясник, №3 крёстный отец, №4 доктор, №8 мафия, №10 проститутка.
const TABLE = 'S butcher G D c c c M c P c'

test('шаг мясника: вопрос, запись, метка «цель мясника» на карточке', async () => {
  const { app, user } = renderApp(nightOf(TABLE, [], 'butcher_kill:2'))
  expect(within(screen.getByRole('navigation', { name: 'Шаги ночи' })).getAllByRole('button').map((b) => b.getAttribute('data-step')))
    .toEqual(['prostitute_block:10', 'mafia_shot', 'godfather_search:3', 'butcher_kill:2', 'sheriff_check:1', 'doctor_heal:4', 'summary'])
  expect(screen.getByText('Кого убивает мясник?')).toBeInTheDocument(); expect(screen.getByText('Просыпается мясник — №2')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' }))
  expect(app.getState().game!.night!.steps.find((s) => s.id === 'butcher_kill:2')).toMatchObject({ recorded: true, target: 5 })
  expect(within(card(5)).getByText('цель мясника')).toBeInTheDocument()
  // Мясник — одиночка: на его карточке метка «сам за себя».
  expect(within(card(2)).getByText('сам за себя')).toBeInTheDocument()
})
test('итог ночи: двое выбывают — «Застрелен мафией» и «Убит мясником»; утро называет обоих', async () => {
  const { app, user, env } = renderApp(summaryOf(TABLE, [['mafia_shot', null, 7], ['butcher_kill', 2, 5]]))
  expect(mark(5)).toBeChecked(); expect(mark(7)).toBeChecked()
  const rows = within(leaving()).getAllByRole('checkbox').map((box) => box.closest('label')!.textContent)
  expect(rows).toEqual(['№5Убит мясникомникто не лечил', '№7Застрелен мафиейникто не лечил'])
  expect(within(card(5)).getByText('цель мясника')).toBeInTheDocument(); expect(within(card(7)).getByText('цель мафии')).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Выбывают двое · начать День 2/ }))
  expect(outSeats(app)).toEqual([5, 7]); expect(app.getState().game!.players[4]).toMatchObject({ cause: 'slain' })
  const dialog = within(screen.getByRole('dialog', { name: 'Объяви столу' }))
  expect(dialog.getByText('Стол покидают игроки')).toBeInTheDocument(); expect(dialog.getByText('№5 и №7')).toBeInTheDocument()
  // Причин и ролей в окне утра нет.
  expect(dialog.queryByText(/мясник|мафи/i)).not.toBeInTheDocument()
})
test('доктор спас от мясника: «Вылечен доктором — на него напал мясник»; мясник заблокирован: «Удара этой ночью не будет»', () => {
  const saved = renderApp(summaryOf(TABLE, [['butcher_kill', 2, 5], ['doctor_heal', 4, 5]]))
  expect(within(staying()!).getByText('Вылечен доктором')).toBeInTheDocument(); expect(within(staying()!).getByText('на него напал мясник')).toBeInTheDocument()
  expect(within(leaving()).getByText('Никто не покидает стол')).toBeInTheDocument()
  saved.unmount()
  renderApp(nightOf(TABLE, [['prostitute_block', 10, 2], ['butcher_kill', 2, 5]], 'butcher_kill:2'))
  const box = screen.getByRole('alert')
  expect(box).toHaveTextContent('№2 заблокирован'); expect(box).toHaveTextContent('Удара этой ночью не будет.')
  expect(document.querySelector('[data-step="butcher_kill:2"]')).toHaveAttribute('data-blocked')
})
test('при скрытых ролях причин смерти не видно: ни на итоге ночи, ни на карточке выбывшего', async () => {
  const { app } = renderApp((a) => {
    summaryOf(TABLE, [['mafia_shot', null, 7], ['butcher_kill', 2, 5]])(a); a.setSettings({ rolesHidden: true })
  })
  expect(mark(5)).toBeChecked(); expect(screen.queryByText(/Убит мясником|Застрелен мафией|цель мясника|сам за себя/)).not.toBeInTheDocument()
  app.dispatch({ type: 'confirmNight', died: [5, 7] }); app.dispatch({ type: 'announceMorning' })
  // День: роли скрыты — у обоих выбывших одна и та же подпись без причины.
  expect(app.getState().settings.rolesHidden).toBe(true)
  expect(await within(card(5)).findByText('выбыл · Ночь 1')).toBeInTheDocument(); expect(within(card(7)).getByText('выбыл · Ночь 1')).toBeInTheDocument()
  expect(within(card(5)).queryByText(/мясник/)).not.toBeInTheDocument()
  // Роли открыты — причина подписана словом.
  app.setSettings({ rolesHidden: false })
  expect(await within(card(5)).findByText('убит мясником · Ночь 1')).toBeInTheDocument(); expect(within(card(7)).getByText('застрелен · Ночь 1')).toBeInTheDocument()
  // Выгнанный голосованием подписан и при скрытых ролях: это знает весь стол.
  app.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'voted' }); app.setSettings({ rolesHidden: true })
  expect(await within(card(9)).findByText('выгнан · День 2')).toBeInTheDocument()
})
test('кнопки «Добавить выбывшего…» и «Назад к шагам ночи» стоят в одном прилипающем блоке с главной кнопкой', () => {
  renderApp(summaryOf(TABLE, [['mafia_shot', null, 7]]))
  const footer = document.querySelector('.step-footer') as HTMLElement
  for (const name of [/Добавить выбывшего…/, /Назад к шагам ночи/, /№7 выбывает · начать День 2/]) expect(within(footer).getByRole('button', { name })).toBeInTheDocument()
  // Списки итога — вне этого блока: они прокручиваются под ним.
  expect(footer).not.toContainElement(leaving())
})
