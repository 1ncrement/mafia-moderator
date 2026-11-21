import { act, render, screen, within } from '@testing-library/react'
import { StoreProvider } from '../../src/app/StoreContext'
import { createAppStore } from '../../src/app/store'
import type { AppStore } from '../../src/app/store'
import { App } from '../../src/ui/App'
import { MorningDialog } from '../../src/ui/game/MorningDialog'
import { TABLE_11, testEnv } from '../helpers'
import { advance, renderApp, seedGame } from './helpers'

// Утреннее окно «Объяви столу» (дополнение 5.6): открывается после подтверждения итога ночи, закрывается кнопкой «Объявил».

const N1 = { kind: 'night', n: 1 } as const
/** Ночь 1 с выстрелом в первого из died, открыт итог. */
const onSummary = (died: number[]) => (a: AppStore) => {
  seedGame(a, TABLE_11, 1)
  a.dispatch({ type: 'startPhase', phase: N1 })
  if (died[0] !== undefined) a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: died[0] })
  a.dispatch({ type: 'enterStep', step: 'summary' })
}
/** Начало Дня 2 сразу после подтверждения Ночи 1: утро ещё не объявлено. */
const morningAfter = (died: number[]) => (a: AppStore) => { onSummary(died)(a); a.dispatch({ type: 'confirmNight', died }) }
const dialog = () => screen.queryByRole('dialog', { name: 'Объяви столу' })
const reopen = () => screen.queryByRole('button', { name: 'Объявление утра' })

test('окно утра: три варианта текста — никто не выбыл, один, несколько', () => {
  const quiet = renderApp(morningAfter([]))
  expect(within(dialog()!).getByText('День 2')).toBeInTheDocument()
  expect(within(dialog()!).getByText('Город просыпается в полном составе')).toBeInTheDocument()
  expect(within(dialog()!).getByText('Этой ночью никто не покинул стол.')).toBeInTheDocument()
  quiet.unmount()
  const one = renderApp(morningAfter([7]))
  expect(dialog()!.textContent).toContain('Стол покидает игрок №7')
  one.unmount()
  renderApp(morningAfter([9, 3, 7]))
  expect(dialog()!.textContent).toContain('Стол покидают игроки №3, №7 и №9')
})
test('«Объявил» закрывает окно: после перезагрузки страницы оно не возвращается, после «Отменить» — возвращается', async () => {
  const { app, user, env, unmount } = renderApp(morningAfter([7]))
  advance(env, 500); await user.click(screen.getByRole('button', { name: 'Объявил' }))
  expect(dialog()).not.toBeInTheDocument(); expect(app.getState().game!.morning).toMatchObject({ deaths: [7], announced: true })
  // Перезагрузка страницы: новое приложение на том же хранилище.
  unmount()
  const reloaded = createAppStore(env)
  const view = render(<App store={reloaded} />)
  expect(reloaded.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(dialog()).not.toBeInTheDocument()
  // «Отменить» возвращает окно: день тот же, утро снова не объявлено.
  await user.click(screen.getByRole('button', { name: 'Отменить' }))
  expect(reloaded.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(dialog()!.textContent).toContain('Стол покидает игрок №7')
  view.unmount()
})
test('необъявленное утро переживает перезагрузку: окно открывается снова', () => {
  const { env, unmount } = renderApp(morningAfter([7]))
  unmount()
  render(<App store={createAppStore(env)} />)
  expect(dialog()!.textContent).toContain('Стол покидает игрок №7')
})
test('под открытым окном Enter и пробел не нажимают главную кнопку шага: первый Enter — «Объявил», второй — главная кнопка', async () => {
  const { app, user, env } = renderApp(morningAfter([7]))
  expect(app.getState().game!.step).toBe('balagan')
  advance(env, 500)
  await user.keyboard(' '); expect(dialog()).toBeInTheDocument(); expect(app.getState().game!.day!.speaking).toBeNull()
  await user.keyboard('{Enter}'); expect(dialog()).not.toBeInTheDocument()
  // Балаган не запущен: Enter достался окну, а не кнопке «Запустить балаган».
  expect(app.getState().game!.day!.speaking).toBeNull(); expect(app.getState().session!.timer).toBeNull()
  advance(env, 500); await user.keyboard('{Enter}')
  expect(app.getState().game!.day!.speaking).toMatchObject({ kind: 'balagan' })
})
test('двойной Enter на итоге ночи окно утра не закрывает: первые 0,4 секунды «Объявил» не срабатывает; Esc его тоже не закрывает', async () => {
  const { app, user, env } = renderApp(onSummary([7]))
  await user.keyboard('{Enter}')
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(dialog()).toBeInTheDocument()
  await user.keyboard('{Enter}'); await user.click(screen.getByRole('button', { name: 'Объявил' })); await user.keyboard('{Escape}')
  expect(dialog()).toBeInTheDocument(); expect(app.getState().game!.morning!.announced).toBe(false)
  advance(env, 500); await user.keyboard('{Escape}'); expect(dialog()).toBeInTheDocument()
  await user.keyboard('{Enter}'); expect(dialog()).not.toBeInTheDocument()
})
test('в окне утра нет ролей и причин; оно открыто при скрытых ролях', () => {
  const { app } = renderApp((a) => {
    seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
    a.dispatch({ type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 5 })
    a.dispatch({ type: 'confirmNight', died: [7] })
  })
  expect(app.getState().settings.rolesHidden).toBe(true)
  const text = dialog()!.textContent ?? ''
  expect(text).not.toMatch(/мафи|застрел|убит|доктор|вылеч|шериф|проститут|заблок|мирн|крёстн|чёрн|красн/i)
  // Из номеров — только выбывший: ни цели лечения, ни заблокированного, ни исполнителей в окне нет.
  expect(text.match(/№\d+/g)).toEqual(['№7'])
})
test('«Объявление утра» открывает окно снова до конца дня и в журнал больше не пишет', async () => {
  const { app, user, env } = renderApp(morningAfter([7]))
  // Пока утро не объявлено, кнопки нет: окно и так открыто.
  expect(reopen()).not.toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: 'Объявил' }))
  const depth = app.getState().session!.undo.length
  await user.click(reopen()!)
  expect(dialog()!.textContent).toContain('Стол покидает игрок №7')
  // Повторный показ: отменять нечего, Esc закрывает.
  expect(within(dialog()!).queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument()
  await user.keyboard('{Escape}'); expect(dialog()).not.toBeInTheDocument()
  await user.click(reopen()!); advance(env, 500); await user.click(within(dialog()!).getByRole('button', { name: 'Объявил' }))
  expect(dialog()).not.toBeInTheDocument(); expect(app.getState().session!.undo).toHaveLength(depth)
  // Кнопка остаётся на следующих шагах дня и пропадает с началом ночи.
  act(() => { app.dispatch({ type: 'enterStep', step: 'speeches' }) }); expect(reopen()).toBeInTheDocument()
  act(() => { app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }) }); expect(reopen()).not.toBeInTheDocument()
})
test('в День 1 утра нет: ни окна, ни кнопки', () => {
  renderApp((a) => seedGame(a, TABLE_11, 1))
  expect(dialog()).not.toBeInTheDocument(); expect(reopen()).not.toBeInTheDocument()
})
test('из окна утра можно вернуться к итогу ночи: «Отменить» в окне и Ctrl+Z', async () => {
  const { app, user } = renderApp(morningAfter([7]))
  await user.click(within(dialog()!).getByRole('button', { name: 'Отменить' }))
  expect(app.getState().game!.phase).toEqual(N1); expect(dialog()).not.toBeInTheDocument(); expect(app.getState().game!.players[6]!.status).toBe('alive')
  act(() => { app.dispatch({ type: 'confirmNight', died: [7] }) })
  expect(dialog()).toBeInTheDocument()
  await user.keyboard('{Control>}z{/Control}')
  expect(app.getState().game!.phase).toEqual(N1); expect(dialog()).not.toBeInTheDocument()
})
test('строки под объявлением: кто прощается, кто был в бронежилете, кто сегодня молчит', () => {
  const shown = (deaths: number[]) => {
    const view = render(
      <StoreProvider store={createAppStore(testEnv())}>
        <MorningDialog day={3} seconds={30} first morning={{ deaths, farewell: [9], spared: [2], silenced: [4], announced: false }} onDone={() => {}} />
      </StoreProvider>,
    )
    const items = within(screen.getByRole('dialog')).getAllByRole('listitem').map((li) => li.textContent)
    const text = screen.getByRole('dialog').textContent
    view.unmount()
    return { items, text }
  }
  const LINES = ['№9прощается со столом — 30 с', '№2был в бронежилете — остаётся в игре', '№4сегодня молчит']
  expect(shown([3, 7, 9])).toMatchObject({ items: LINES, text: expect.stringContaining('День 3') })
  // Тихая ночь со спасённым и молчащим: строки есть и под «в полном составе».
  expect(shown([])).toMatchObject({ items: LINES, text: expect.stringContaining('Город просыпается в полном составе') })
})
