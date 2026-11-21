import { screen, within } from '@testing-library/react'
import { advance, renderApp } from './helpers'
import { card, leaving, mark, nightOf, outSeats, staying, summaryOf } from './roleNights'

// Охранник на экране. Стол: №1 шериф, №2 охранник, №3 крёстный отец, №4 доктор, №5 мясник, №8 мафия, №10 проститутка.
const TABLE = 'S bodyguard G D butcher c c M c P c'

test('шаг охранника — последний в ночи; себя выбрать нельзя; на его карточке метка «защищает №7»', async () => {
  const { app, user } = renderApp(nightOf(TABLE, [], 'bodyguard_guard:2'))
  const steps = within(screen.getByRole('navigation', { name: 'Шаги ночи' })).getAllByRole('button').map((b) => b.getAttribute('data-step'))
  expect(steps.slice(-2)).toEqual(['bodyguard_guard:2', 'summary'])
  expect(screen.getByText('Кого защищает охранник?')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Выбрать игрока №2' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ target: 7 })
  expect(within(card(2)).getByText('защищает №7')).toBeInTheDocument()
})
test('повтор цели — предупреждение и «Записать всё равно»', async () => {
  const { app, user } = renderApp((a) => {
    nightOf(TABLE, [['bodyguard_guard', 2, 7]])(a); a.dispatch({ type: 'confirmNight', died: [] }); a.dispatch({ type: 'announceMorning' })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: 'bodyguard_guard:2' })
  })
  expect(screen.getByText(/Прошлой ночью: №7/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(screen.getByText('Этого игрока охранник защищал прошлой ночью')).toBeInTheDocument(); expect(app.getState().game!.night!.steps.at(-1)!.recorded).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Записать всё равно' })); expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ target: 7 })
})
test('итог ночи: «Охранник закрыл собой №7 — погиб вместо него · прощается 30 с»; у остальных — «никто не лечил и не защищал»', async () => {
  const { app, user, env } = renderApp(summaryOf(TABLE, [['mafia_shot', null, 7], ['butcher_kill', 5, 9], ['bodyguard_guard', 2, 7]]))
  const rows = within(leaving()).getAllByRole('checkbox').map((box) => box.closest('label')!.textContent)
  expect(rows).toEqual(['№2Охранник закрыл собой №7погиб вместо него · прощается 30 с', '№9Убит мясникомникто не лечил и не защищал'])
  expect(mark(2)).toBeChecked()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Выбывают двое · начать День 2/ }))
  expect(outSeats(app)).toEqual([2, 9])
  // Утро: охранник прощается, хотя правило «прощание после ночной смерти» выключено.
  const dialog = within(screen.getByRole('dialog', { name: 'Объяви столу' }))
  expect(dialog.getByText('№2 и №9')).toBeInTheDocument()
  expect(dialog.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['№2прощается со столом — 30 с'])
  advance(env, 500); await user.click(dialog.getByRole('button', { name: /Объявил/ }))
  expect(app.getState().game!.step).toBe('night_farewell')
  expect(screen.getByRole('button', { name: /Прощание №2 · 30 с/ })).toBeInTheDocument()
})
test('доктор вылечил охранника, закрывшего собой: «Вылечен доктором — закрыл собой игрока и выжил»', () => {
  renderApp(summaryOf(TABLE, [['mafia_shot', null, 7], ['bodyguard_guard', 2, 7], ['doctor_heal', 4, 2]]))
  expect(within(leaving()).getByText('Никто не покидает стол')).toBeInTheDocument()
  expect(within(staying()!).getByText('№2')).toBeInTheDocument(); expect(within(staying()!).getByText('закрыл собой игрока и выжил')).toBeInTheDocument()
})
test('охранник заблокирован: «Защита этой ночью не сработает»; в игре без охранника подпись прежняя — «никто не лечил»', () => {
  const blocked = renderApp(nightOf(TABLE, [['prostitute_block', 10, 2]], 'bodyguard_guard:2'))
  expect(screen.getByRole('alert')).toHaveTextContent('№2 заблокирован'); expect(screen.getByRole('alert')).toHaveTextContent('Защита этой ночью не сработает.')
  blocked.unmount()
  renderApp(summaryOf('S c G D c c c M c P c', [['mafia_shot', null, 7]]))
  expect(within(leaving()).getByText('никто не лечил')).toBeInTheDocument()
})
test('при скрытых ролях карточка погибшего охранника не называет причину; с открытыми — «закрыл собой игрока»', async () => {
  const { app } = renderApp((a) => {
    summaryOf(TABLE, [['mafia_shot', null, 7], ['bodyguard_guard', 2, 7]])(a); a.dispatch({ type: 'confirmNight', died: [2] }); a.dispatch({ type: 'announceMorning' })
  })
  expect(app.getState().settings.rolesHidden).toBe(true)
  expect(await within(card(2)).findByText('выбыл · Ночь 1')).toBeInTheDocument()
  app.setSettings({ rolesHidden: false })
  expect(await within(card(2)).findByText('закрыл собой игрока · Ночь 1')).toBeInTheDocument()
})
