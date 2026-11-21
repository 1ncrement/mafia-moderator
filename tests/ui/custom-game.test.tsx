import { screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { countBy, CUSTOM_TABLE, JOURNALIST, MANIAC } from '../helpers'
import { renderApp, seedCustomGame } from './helpers'

const seed = (day: number) => (a: AppStore) => seedCustomGame(a, [JOURNALIST, MANIAC], CUSTOM_TABLE, day)
const N1 = { kind: 'night', n: 1 } as const

test('распределение называет свои роли', () => {
  renderApp((a) => { seedCustomGame(a, [JOURNALIST, MANIAC], CUSTOM_TABLE, 0) })   // фаза распределения
  expect(screen.getAllByText('журналист').length).toBeGreaterThan(0); expect(screen.getAllByText('маньяк').length).toBeGreaterThan(0)
})
test('ночной шаг своей роли: вопрос, запись, блок «Записано», метка на карточке, журнал', async () => {
  const { app, user } = renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }) })
  expect(screen.getByText('Кого выбирает журналист?')).toBeInTheDocument()
  expect(within(document.querySelector<HTMLElement>('[data-step="act_custom_j:6"]')!).getByText('своя роль')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ recorded: true, target: 9 })
  expect(screen.getByText('Записано · Журналист')).toBeInTheDocument()
  expect(screen.getByText(/Приложение только записывает выбор/)).toBeInTheDocument()
  expect(screen.getByText('выбор: журналист')).toBeInTheDocument()
  expect(screen.getByText('Журналист → №9')).toBeInTheDocument()
})
test('подсказка итога ночи не зависит от записи своей роли', async () => {
  renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
    a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 6, target: 7 }); a.dispatch({ type: 'enterStep', step: 'summary' }) })
  expect(screen.getByRole('checkbox', { name: '№7 покидает стол' })).toBeChecked(); expect(screen.getByText('Застрелен мафией')).toBeInTheDocument()
})
test('блок проститутки показан плашкой; шериф видит чёрную свою роль чёрной', async () => {
  const { user } = renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 6 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }) })
  expect(screen.getByText('Покажи игроку, что он заблокирован. Действие этой ночью не состоится.')).toBeInTheDocument()
  await user.click(document.querySelector<HTMLElement>('[data-step="sheriff_check:1"]')!)
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(screen.getByText('№9 — чёрный')).toBeInTheDocument()
})
test('скрытые роли прячут свою роль', async () => {
  renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 6, target: 9 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }); a.setSettings({ rolesHidden: true }) })
  for (const text of ['Записано · Журналист', 'выбор: журналист', 'своя роль', 'Журналист → №9']) expect(screen.queryByText(text)).not.toBeInTheDocument()
})
test('окно остановки и итоги называют свои роли по сторонам', async () => {
  const { user } = renderApp(seed(2))
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('radio', { name: /Чёрные/ })).toHaveTextContent('маньяк')
  expect(dialog.getByRole('radio', { name: /Красные/ })).toHaveTextContent('журналист')
  await user.click(dialog.getByRole('radio', { name: /Красные/ })); await user.click(dialog.getByRole('button', { name: /Завершить/ }))
  expect(screen.getAllByText('журналист').length).toBeGreaterThan(0)
})

// ── Сверх плана ─────────────────────────────────────────────────────────────

test('«Кто есть кто» на распределении называет свои роли с номерами', () => {
  renderApp((a) => { seedCustomGame(a, [JOURNALIST, MANIAC], CUSTOM_TABLE, 0) })
  const who = within(screen.getByText('Кто есть кто').closest('.deal-who') as HTMLElement)
  expect(who.getByText('Журналист')).toBeInTheDocument(); expect(who.getByText('Маньяк')).toBeInTheDocument()
  expect(who.getByText('Журналист').closest('.deal-who-row')).toHaveTextContent('№6')
})
test('своя роль выбрала «Никого»: записано «→ никого», метки на карточках нет', async () => {
  const { app, user } = renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }) })
  expect(screen.queryByText(/Записано/)).not.toBeInTheDocument()   // до выбора блока «Записано» нет
  await user.click(screen.getByRole('button', { name: 'Никого' }))
  expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ recorded: true, target: null })
  expect(within(screen.getByText('Записано · Журналист').closest('.answer') as HTMLElement).getByText('→ никого')).toBeInTheDocument()
  expect(screen.queryByText('выбор: журналист')).not.toBeInTheDocument()
  expect(screen.getByText('Журналист → никого')).toBeInTheDocument()
})
test('метка «выбор» видна и на итоге ночи; у шага встроенной роли пометки «своя роль» нет', () => {
  renderApp((a) => { seed(1)(a); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 6, target: 9 }); a.dispatch({ type: 'enterStep', step: 'summary' }) })
  expect(screen.getByText('выбор: журналист')).toBeInTheDocument()
  expect(screen.getAllByText('своя роль')).toHaveLength(1)
  expect(within(document.querySelector<HTMLElement>('[data-step="doctor_heal:4"]')!).queryByText('своя роль')).not.toBeInTheDocument()
})
test('два носителя одной своей роли: у каждого свой шаг с номером, запись и метка — по шагу', async () => {
  const table = CUSTOM_TABLE.map((r, i) => (i === 6 ? 'custom_j' : r))
  const { user } = renderApp((a) => { seedCustomGame(a, [JOURNALIST, MANIAC], table, 1); a.dispatch({ type: 'startPhase', phase: N1 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:7' }) })
  expect(within(document.querySelector<HTMLElement>('[data-step="act_custom_j:7"]')!).getByText('Журналист №7')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №2' }))
  expect(screen.getByText('Записано · Журналист №7')).toBeInTheDocument()
  expect(screen.getByText('Журналист №7 → №2')).toBeInTheDocument()
})
test('ночь на украинском: название своей роли то же, вопрос и пояснение переведены', () => {
  renderApp((a) => { seed(1)(a); a.setSettings({ lang: 'uk' }); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 6, target: 9 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:6' }) })
  expect(screen.getByText('Кого обирає журналист?')).toBeInTheDocument()
  expect(screen.getByText('вибір: журналист')).toBeInTheDocument()
  expect(screen.getByText(/Застосунок лише записує вибір/)).toBeInTheDocument()
})
test('игра открывается и называет роль, которой в перечне настроек нет', () => {
  const { app } = renderApp(seed(1))
  expect(app.getState().settings.customRoles).toEqual([])
  expect(screen.getAllByText('журналист').length).toBeGreaterThan(0); expect(screen.getAllByText('маньяк').length).toBeGreaterThan(0)
  expect(screen.getByText('чёрных')).toBeInTheDocument()
  expect(app.getState().game!.counts.bySide).toMatchObject({ black: 4, red: 7 })
})

// ── По итогам независимого ревью ────────────────────────────────────────────

test('два носителя выбрали одного игрока: метки различаются номером носителя', () => {
  const table = CUSTOM_TABLE.map((r, i) => (i === 6 ? 'custom_j' : r))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    renderApp((a) => { seedCustomGame(a, [JOURNALIST, MANIAC], table, 1); a.dispatch({ type: 'startPhase', phase: N1 })
      a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 6, target: 9 })
      a.dispatch({ type: 'recordNightAction', actionId: 'act_custom_j', actor: 7, target: 9 }); a.dispatch({ type: 'enterStep', step: 'act_custom_j:7' }) })
    expect(screen.getByText('выбор: журналист №6')).toBeInTheDocument(); expect(screen.getByText('выбор: журналист №7')).toBeInTheDocument()
    expect(errors).not.toHaveBeenCalled()                          // React не жалуется на одинаковые ключи меток
  } finally {
    errors.mockRestore()
  }
})
test('перераздача сохраняет свои роли в колоде', async () => {
  const { app, user } = renderApp((a) => { seedCustomGame(a, [JOURNALIST, MANIAC], CUSTOM_TABLE, 0) })
  const dealt = app.getState().session!.log.find((e) => e.type === 'roles_dealt')!.id
  await user.click(screen.getByRole('button', { name: 'Перераздать' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Перераздать роли' }))
  expect(app.getState().session!.log.find((e) => e.type === 'roles_dealt')!.id).not.toBe(dealt)
  expect(countBy(app.getState().game!.players.map((p) => p.roleId))).toEqual(countBy(CUSTOM_TABLE))
  expect(app.getState().session!.config.customRoles).toEqual([JOURNALIST, MANIAC])
})
